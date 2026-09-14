/**
 * Pipeline Gateway API client.
 *
 * `VITE_PIPELINE_API_BASE_URL` may point at a dedicated gateway. When it is
 * not supplied, the existing Vite API base URL convention is used.
 */
export function getPipelineApiBaseUrl() {
  let configuredUrl = null

  try {
    configuredUrl = import.meta.env.VITE_PIPELINE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL
  } catch (e) {}

  if (configuredUrl && typeof configuredUrl === 'string' && configuredUrl.trim()) {
    return configuredUrl.trim().replace(/\/+$/, '')
  }

  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `http://${window.location.hostname}:8000`
  }

  return 'http://127.0.0.1:8000'
}

async function readResponse(response) {
  let data = null

  try {
    data = await response.json()
  } catch (e) {}

  if (!response.ok) {
    const detail = data?.detail || data?.message || `Pipeline request failed (HTTP ${response.status})`
    const error = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
    error.status = response.status
    error.detail = detail
    throw error
  }

  return data
}

/**
 * Start a new pipeline run.
 *
 * @param {object} [payload] Optional run configuration accepted by the gateway.
 * @returns {Promise<object>} The created pipeline-run payload.
 */
export async function createPipelineRun(payload) {
  const options = { method: 'POST' }

  if (payload !== undefined) {
    options.headers = { 'Content-Type': 'application/json' }
    options.body = JSON.stringify(payload)
  }

  const response = await fetch(`${getPipelineApiBaseUrl()}/api/v1/pipeline/run`, options)
  return readResponse(response)
}

/**
 * Retrieve the latest status for one pipeline run.
 *
 * @param {string} runId
 * @returns {Promise<object>} The pipeline status payload.
 */
export async function getPipelineStatus(runId) {
  if (!runId) {
    throw new Error('A pipeline run ID is required.')
  }

  const response = await fetch(
    `${getPipelineApiBaseUrl()}/api/v1/pipeline/run/${encodeURIComponent(runId)}`
  )
  return readResponse(response)
}

/**
 * Manually trigger the Agent module for an existing pipeline run.
 *
 * @param {string} pipelineRunId
 * @returns {Promise<object>} The Agent-run response payload.
 */
export async function runAgentNow(pipelineRunId) {
  if (!pipelineRunId) {
    throw new Error('A pipeline run ID is required to run the agent.')
  }

  const response = await fetch(`${getPipelineApiBaseUrl()}/api/v1/agent/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pipeline_run_id: pipelineRunId }),
  })

  return readResponse(response)
}

/**
 * List recent pipeline runs from the shared database.
 *
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function listPipelineRuns(limit = 25) {
  try {
    const response = await fetch(`${getPipelineApiBaseUrl()}/api/v1/pipeline/runs?limit=${limit}`)
    if (!response.ok) return []
    return await response.json()
  } catch (err) {
    console.warn('Could not fetch pipeline runs list:', err)
    return []
  }
}

/**
 * Manually trigger RAG processing for a pipeline run.
 *
 * @param {object} params
 * @param {string} params.pipelineRunId
 * @param {string} params.extractedDataId
 * @param {string} [params.question]
 * @returns {Promise<object>}
 */
export async function runRagNow({ pipelineRunId, extractedDataId, question }) {
  if (!pipelineRunId || !extractedDataId) {
    throw new Error('pipeline_run_id and extracted_data_id are required to trigger RAG.')
  }

  const response = await fetch(`${getPipelineApiBaseUrl()}/api/v1/rag/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pipeline_run_id: pipelineRunId,
      extracted_data_id: extractedDataId,
      question: question || undefined,
    }),
  })

  return readResponse(response)
}

/**
 * Trigger an end-to-end pipeline run from an image File or Blob.
 * 1. Creates a new pipeline_run record in the gateway database.
 * 2. Feeds the image into the Vision intake endpoint (/api/v1/gateway/run).
 * 3. The poller automatically orchestrates RAG -> Agent!
 *
 * @param {File|Blob} imageFile
 * @param {string} [model='clip']
 * @param {number} [topK=10]
 * @returns {Promise<object>}
 */
export async function triggerPipelineWithImage(imageFile, model = 'clip', topK = 10) {
  const newRun = await createPipelineRun()
  const runId = newRun.pipeline_run_id

  const formData = new FormData()
  formData.append('image', imageFile)
  formData.append('run_id', runId)
  formData.append('top_k', topK.toString())
  formData.append('model', model)

  const response = await fetch(`${getPipelineApiBaseUrl()}/api/v1/gateway/run`, {
    method: 'POST',
    body: formData,
  })

  const visionData = await readResponse(response)
  return {
    pipeline_run_id: runId,
    status: visionData.status || 'vision_complete',
    vision: visionData,
  }
}

/**
 * Trigger an end-to-end pipeline run from a catalog sample filename (e.g. "10003.jpg").
 *
 * @param {string} sampleFilename
 * @param {string} [model='clip']
 * @param {number} [topK=10]
 * @returns {Promise<object>}
 */
export async function triggerPipelineWithSample(sampleFilename, model = 'clip', topK = 10) {
  const baseUrl = getPipelineApiBaseUrl()
  const imgUrl = `${baseUrl}/catalog-images/${encodeURIComponent(sampleFilename)}`
  const imgRes = await fetch(imgUrl)
  if (!imgRes.ok) {
    throw new Error(`Failed to fetch sample image asset ${sampleFilename}`)
  }
  const blob = await imgRes.blob()
  const file = new File([blob], sampleFilename, { type: blob.type || 'image/jpeg' })
  return triggerPipelineWithImage(file, model, topK)
}

