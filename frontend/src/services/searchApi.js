/**
 * Visual Product Search API Client Service
 */

/**
 * Dynamically resolve the backend API Base URL based on current environment or browser hostname.
 * Respects VITE_API_BASE_URL when set, otherwise falls back to window.location.hostname.
 */
export const getApiBaseUrl = () => {
  let envUrl = null
  try {
    if (typeof import.meta !== 'undefined' && import.meta && import.meta.env) {
      envUrl = import.meta.env.VITE_API_BASE_URL
    }
  } catch (e) {}
  if (!envUrl && typeof process !== 'undefined' && process.env) {
    envUrl = process.env.VITE_API_BASE_URL
  }
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/+$/, '')
  }
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    const hostname = window.location.hostname
    return `http://${hostname}:8000`
  }
  return 'http://127.0.0.1:8000'
}

export const API_BASE_URL = getApiBaseUrl()

/**
 * Convert a relative catalog image path or filename into a full HTTP browser URL.
 * Supports: "/catalog-images/15025.jpg", "15025.jpg", "/15025.jpg", or full URLs.
 *
 * @param {string} imagePathOrUrl
 * @returns {string} - Full HTTP/HTTPS browser URL
 */
export function getCatalogImageUrl(imagePathOrUrl) {
  if (!imagePathOrUrl) return ''
  const str = String(imagePathOrUrl).trim()
  if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:')) {
    return str
  }
  const baseUrl = getApiBaseUrl()
  let path = str
  if (!path.startsWith('/')) {
    path = `/${path}`
  }
  if (!path.startsWith('/catalog-images/')) {
    path = `/catalog-images${path}`
  }
  return `${baseUrl}${path}`
}

/**
 * Execute visual product search query against backend API.
 * Supports passing either an uploaded File object OR a catalog filename string (e.g. "10003.jpg").
 *
 * @param {File|Blob|string} imageFileOrFilename - Uploaded image File or catalog image filename string.
 * @param {number} topK - Number of top results to return (1-50, default 10).
 * @param {string} model - Embedding model choice ('clip' or 'resnet').
 * @param {string} pipelineRunId - Optional active pipeline run UUID.
 * @returns {Promise<Object>} - SearchResponse payload.
 */
export async function searchProducts(imageFileOrFilename, topK = 10, model = 'clip', pipelineRunId = null) {
  if (!imageFileOrFilename) {
    throw new Error('An image file or catalog filename must be provided for visual search.')
  }

  const topKNum = Number(topK)
  if (!Number.isInteger(topKNum) || topKNum < 1 || topKNum > 50) {
    throw new Error('top_k must be an integer between 1 and 50.')
  }

  const baseUrl = getApiBaseUrl()
  const isUploadedFile = typeof imageFileOrFilename !== 'string'
  const cleanRunId = pipelineRunId && typeof pipelineRunId === 'string' ? pipelineRunId.trim() : null

  // 1. Unified Gateway Run Intake Flow:
  // When an active pipeline run ID and an uploaded image File are provided, call /api/v1/gateway/run
  // to persist assets, extracted_data, module_events, and transition pipeline_runs.status to vision_complete.
  if (cleanRunId && isUploadedFile) {
    const gatewayFormData = new FormData()
    gatewayFormData.append('image', imageFileOrFilename)
    gatewayFormData.append('run_id', cleanRunId)
    gatewayFormData.append('top_k', topKNum.toString())
    gatewayFormData.append('model', model || 'clip')

    try {
      const gwResponse = await fetch(`${baseUrl}/api/v1/gateway/run`, {
        method: 'POST',
        body: gatewayFormData,
      })

      if (gwResponse.ok) {
        const gwData = await gwResponse.json()
        const candidateMatches = Array.isArray(gwData?.matches)
          ? gwData.matches
          : Array.isArray(gwData?.results)
          ? gwData.results
          : []

        return {
          query_filename: imageFileOrFilename.name || 'query.jpg',
          top_k: topKNum,
          total_results: candidateMatches.length,
          model_used: model === 'resnet' ? 'ResNet_50' : 'OpenCLIP_ViT_B_32',
          results: candidateMatches,
          pipeline_run_id: gwData.pipeline_run_id || cleanRunId,
          run_id: gwData.run_id || cleanRunId,
          status: gwData.status || 'vision_complete',
          primary_match: gwData.primary_match || candidateMatches[0] || null,
          extracted_data_id: gwData.extracted_data_id || null,
        }
      }
      // If gateway returns 404 or 503, log warning and fall back to /search
      console.warn(`Gateway /api/v1/gateway/run returned HTTP ${gwResponse.status}; falling back to /search.`)
    } catch (gwErr) {
      console.warn('Gateway run request failed; falling back to /search:', gwErr)
    }
  }

  // 2. Direct / Search Fallback Flow (also passes run_id for status transition when supported)
  const formData = new FormData()
  if (!isUploadedFile) {
    // Direct server-side catalog item search (fast, 0-network download)
    formData.append('catalog_filename', imageFileOrFilename.trim())
  } else {
    // Uploaded user image search
    formData.append('file', imageFileOrFilename)
  }
  formData.append('top_k', topKNum.toString())
  formData.append('model', model || 'clip')
  if (cleanRunId) {
    formData.append('run_id', cleanRunId)
  }

  const searchUrl = `${baseUrl}/search`

  try {
    const response = await fetch(searchUrl, {
      method: 'POST',
      body: formData,
    })

    let data
    try {
      data = await response.json()
    } catch {
      data = null
    }

    if (!response.ok) {
      let detailMsg = `Search request failed (HTTP ${response.status})`
      if (response.status >= 500) {
        detailMsg = 'The visual search server encountered an error processing your request. Please try again.'
      } else if (data && data.detail) {
        if (typeof data.detail === 'string') {
          detailMsg = data.detail
        } else if (Array.isArray(data.detail)) {
          detailMsg = data.detail.map((d) => d.msg || 'Invalid input parameter').join('; ')
        } else {
          detailMsg = 'The search request contained invalid parameters.'
        }
      }

      const error = new Error(detailMsg)
      error.status = response.status
      error.detail = detailMsg
      throw error
    }

    const items = data && (Array.isArray(data.results) ? data.results : Array.isArray(data.matches) ? data.matches : null)
    if (!data || !items) {
      throw new Error('Invalid or malformed response format received from visual search API.')
    }
    data.results = items

    return data
  } catch (err) {
    if (err.status) {
      throw err
    }
    const networkError = new Error('Unable to connect to visual search service. Please ensure the backend gateway is running.')
    networkError.status = 0
    throw networkError
  }
}

/**
 * Fetch top categories with item counts and sample images.
 */
export async function fetchTopCategories(limit = 8) {
  const baseUrl = getApiBaseUrl()
  const res = await fetch(`${baseUrl}/api/catalog/categories?limit=${limit}`)
  if (!res.ok) {
    throw new Error('Failed to fetch catalog categories.')
  }
  return await res.json()
}

/**
 * Fetch catalog products for a specific category or article type.
 */
export async function fetchCategoryProducts(categoryName, limit = 20) {
  const baseUrl = getApiBaseUrl()
  const cleanName = encodeURIComponent(categoryName)
  const res = await fetch(`${baseUrl}/api/catalog/category/${cleanName}?limit=${limit}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch items for category '${categoryName}'.`)
  }
  return await res.json()
}
