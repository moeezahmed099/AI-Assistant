"""Service for generating normalized image embeddings using ONNX Runtime.

Optimized for sub-300MB peak memory footprint to run smoothly within
restricted environments (e.g. Render 512MB RAM free tier) with zero PyTorch runtime.
"""

from os import getenv
from pathlib import Path
from typing import Any, ClassVar, Dict, Optional, Union
import numpy as np
import onnxruntime as ort
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# Default ONNX model artifacts (ordered by memory efficiency and catalog compatibility)
DEFAULT_ONNX_CANDIDATES = [
    PROJECT_ROOT / "artifacts" / "onnx" / "clip_vit_b32_vision_int8.onnx",
    PROJECT_ROOT / "artifacts" / "onnx" / "clip_vit_b32_vision.onnx",
    PROJECT_ROOT / "artifacts" / "onnx" / "mobileclip_s1_vision.onnx",
]

EMBEDDING_DIMENSION = 512

# Standard CLIP normalization constants
CLIP_MEAN = np.array([0.48145466, 0.4578275, 0.40821073], dtype=np.float32)
CLIP_STD = np.array([0.26862954, 0.26130258, 0.27577711], dtype=np.float32)


class EmbeddingService:
    """Service for generating normalized 512-dim image embeddings via ONNX Runtime."""

    _session_cache: ClassVar[Dict[str, ort.InferenceSession]] = {}

    def __init__(
        self,
        model_path: Optional[Union[str, Path]] = None,
        model_name: Optional[str] = None,
        pretrained: Optional[str] = None,
        device: Optional[Any] = None,
    ) -> None:
        """Initialize the EmbeddingService with an ONNX model.

        Args:
            model_path: Optional path to .onnx model file. Auto-discovers default if omitted.
            model_name: Legacy compatibility argument (ignored in ONNX mode).
            pretrained: Legacy compatibility argument (ignored in ONNX mode).
            device: Execution device identifier ('cpu', 'cuda', etc.).
        """
        self.model_path = self._resolve_model_path(model_path)
        self.session = self._get_or_create_session(self.model_path, device=device)

        # Inspect model input/output metadata
        inputs = self.session.get_inputs()
        self.input_name = inputs[0].name
        input_shape = inputs[0].shape  # e.g. [batch_size, 3, 224, 224] or [batch_size, 3, 256, 256]

        # Determine target image resolution from model graph
        try:
            self.target_size = int(input_shape[2]) if len(input_shape) >= 4 and isinstance(input_shape[2], int) else 224
        except Exception:
            self.target_size = 224

        outputs = self.session.get_outputs()
        self.output_name = outputs[0].name

    @classmethod
    def _resolve_model_path(cls, model_path: Optional[Union[str, Path]]) -> Path:
        """Resolve valid ONNX model path from arguments, environment, or default locations."""
        if model_path:
            p = Path(model_path)
            if p.exists():
                return p
            raise FileNotFoundError(f"Specified ONNX model file not found at: {model_path}")

        env_path = getenv("CLIP_ONNX_MODEL_PATH")
        if env_path:
            p = Path(env_path)
            if p.exists():
                return p

        for candidate in DEFAULT_ONNX_CANDIDATES:
            if candidate.exists():
                return candidate

        raise FileNotFoundError(
            f"No ONNX model found. Checked candidate paths:\n"
            + "\n".join(f" - {c}" for c in DEFAULT_ONNX_CANDIDATES)
        )

    @classmethod
    def _get_or_create_session(
        cls, model_path: Path, device: Optional[Any] = None
    ) -> ort.InferenceSession:
        """Initialize and cache InferenceSession to keep memory usage minimal."""
        cache_key = str(model_path.resolve())
        if cache_key not in cls._session_cache:
            sess_options = ort.SessionOptions()
            sess_options.intra_op_num_threads = 2
            sess_options.inter_op_num_threads = 1
            sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

            available = ort.get_available_providers()
            providers = ["CPUExecutionProvider"]
            if device and "cuda" in str(device).lower() and "CUDAExecutionProvider" in available:
                providers.insert(0, "CUDAExecutionProvider")

            try:
                cls._session_cache[cache_key] = ort.InferenceSession(
                    str(model_path), sess_options, providers=providers
                )
            except Exception as e:
                raise RuntimeError(
                    f"Failed to load ONNX model from '{model_path}': {e}"
                ) from e

        return cls._session_cache[cache_key]

    def generate_image_embedding(self, image_source: Union[str, Path, Image.Image]) -> np.ndarray:
        """Generate a normalized 512-dimensional float32 embedding for an image.

        Args:
            image_source: Path to an image file (str or Path) or a PIL Image instance.

        Returns:
            np.ndarray: L2-normalized float32 array of shape (512,).

        Raises:
            FileNotFoundError: If the provided file path does not exist.
            ValueError: If image loading fails or resulting embedding fails validation.
            RuntimeError: If model inference fails.
        """
        image = self._load_image(image_source)

        try:
            tensor = self._preprocess_image(image, self.target_size)
        except Exception as e:
            raise ValueError(f"Failed to preprocess image: {e}") from e

        try:
            outputs = self.session.run([self.output_name], {self.input_name: tensor})
            raw_features = outputs[0]
            embedding = raw_features.squeeze(0).astype(np.float32)

            # L2 normalization to unit hypersphere
            norm = np.linalg.norm(embedding)
            if norm > 0:
                embedding = embedding / norm
        except Exception as e:
            raise RuntimeError(f"Error executing ONNX model inference: {e}") from e

        self._validate_embedding(embedding)
        return embedding

    def _preprocess_image(self, image: Image.Image, target_size: int) -> np.ndarray:
        """Preprocess PIL image to normalized NCHW tensor using pure PIL and NumPy."""
        w, h = image.size

        # Resize shortest edge to target size preserving aspect ratio
        if w < h:
            new_w = target_size
            new_h = int(round(target_size * h / w))
        else:
            new_w = int(round(target_size * w / h))
            new_h = target_size

        resample_mode = Image.BICUBIC if hasattr(Image, "BICUBIC") else Image.BILINEAR
        resized = image.resize((new_w, new_h), resample=resample_mode)

        # Center crop to target_size x target_size
        left = (new_w - target_size) // 2
        top = (new_h - target_size) // 2
        cropped = resized.crop((left, top, left + target_size, top + target_size))

        # Convert to float32 [0.0, 1.0]
        arr = np.array(cropped, dtype=np.float32) / 255.0

        # CLIP normalization: (image - mean) / std
        arr = (arr - CLIP_MEAN) / CLIP_STD

        # Transpose HWC -> CHW and add batch dimension -> NCHW (1, 3, H, W)
        arr = np.transpose(arr, (2, 0, 1))
        arr = np.expand_dims(arr, axis=0)
        return np.ascontiguousarray(arr, dtype=np.float32)

    def _load_image(self, image_source: Union[str, Path, Image.Image]) -> Image.Image:
        """Load and convert input image to RGB PIL Image format."""
        if isinstance(image_source, (str, Path)):
            path = Path(image_source)
            if not path.exists():
                raise FileNotFoundError(f"Image file does not exist: {path}")
            if not path.is_file():
                raise ValueError(f"Path is not a file: {path}")
            try:
                return Image.open(path).convert("RGB")
            except Exception as e:
                raise ValueError(f"Failed to open image file at {path}: {e}") from e
        elif isinstance(image_source, Image.Image):
            return image_source.convert("RGB")
        else:
            raise TypeError(
                f"Unsupported image source type: {type(image_source).__name__}. "
                "Expected str, pathlib.Path, or PIL.Image.Image."
            )

    def _validate_embedding(self, embedding: np.ndarray) -> None:
        """Validate embedding data type, shape, and value sanity."""
        if embedding.dtype != np.float32:
            raise ValueError(f"Expected embedding dtype float32, got {embedding.dtype}")
        if embedding.shape != (EMBEDDING_DIMENSION,):
            raise ValueError(
                f"Expected embedding dimension ({EMBEDDING_DIMENSION},), got {embedding.shape}"
            )
        if not np.all(np.isfinite(embedding)):
            raise ValueError("Generated embedding contains non-finite values (NaN or Inf).")
