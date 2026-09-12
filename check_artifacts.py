import numpy as np
ids = np.load('artifacts/embeddings/clip_catalog_ids.npy')
emb = np.load('artifacts/embeddings/clip_embeddings.npy')
print('IDs:', len(ids), ids.min(), ids.max())
print('Embeddings shape:', emb.shape)
