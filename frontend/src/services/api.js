const backendUrl = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/+$/, "") : "";
export const API_BASE = backendUrl ? `${backendUrl}/api` : '/api';

/**
 * A wrapper around fetch that automatically includes credentials (cookies)
 * and attempts to refresh the access token if a 401 Unauthorized is returned.
 */
async function fetchWithAuth(url, options = {}) {
  // Always include credentials so cookies are sent
  const finalOptions = {
    ...options,
    credentials: 'include',
  };

  let response = await fetch(url, finalOptions);

  // If the access token is expired or invalid, we get a 401
  if (response.status === 401) {
    // Attempt to refresh the token
    const refreshResponse = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (refreshResponse.ok) {
      // Refresh succeeded, the new access_token cookie is now set.
      try {
        const data = await refreshResponse.clone().json();
        if (data.access_token) {
          sessionStorage.setItem('access_token', data.access_token);
        }
      } catch (e) {
        console.warn("Failed to parse refresh token from response", e);
      }
      
      // Retry the original request
      response = await fetch(url, finalOptions);
    } else {
      // Refresh failed (e.g. refresh token expired or missing)
      // The user must log in again.
      sessionStorage.removeItem('access_token');
      throw new Error('Session expired. Please log in again.');
    }
  }

  return response;
}

// ---------------------------------------------------------
// Auth API Endpoints
// ---------------------------------------------------------

export async function checkAuth() {
  const response = await fetchWithAuth(`${API_BASE}/auth/check`);
  if (!response.ok) {
    throw new Error('Not authenticated');
  }
  const data = await response.json();
  if (data.access_token) {
    sessionStorage.setItem('access_token', data.access_token);
  }
  return data;
}

export async function logout() {
  const response = await fetchWithAuth(`${API_BASE}/auth/logout`, { method: 'POST' });
  sessionStorage.removeItem('access_token');
  return response.json();
}

export async function googleLogin(credential) {
  const response = await fetch(`${API_BASE}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ credential }),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Google login failed' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  
  const data = await response.json();
  if (data.access_token) {
    sessionStorage.setItem('access_token', data.access_token);
  }
  return data;
}

// ---------------------------------------------------------
// Core API Endpoints
// ---------------------------------------------------------

export async function analyzeText(text, followupContext = null) {
  const formData = new FormData();
  formData.append('text', text);
  if (followupContext) {
    formData.append('followup_context', followupContext);
  }

  const response = await fetchWithAuth(`${API_BASE}/analyze`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function analyzeFile(file, followupContext = null) {
  const formData = new FormData();
  formData.append('file', file);
  if (followupContext) {
    formData.append('followup_context', followupContext);
  }

  const response = await fetchWithAuth(`${API_BASE}/analyze`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// ── Interactive Analysis Mode ─────────────────────────────────────────────────

export async function generateFollowUpQuestions(text = null, file = null) {
  const formData = new FormData();
  if (text) formData.append('text', text);
  if (file) formData.append('file', file);

  const response = await fetchWithAuth(`${API_BASE}/analyze/followup-questions`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to generate follow-up questions' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function submitFollowUpAnswers(transcript, conversation) {
  const response = await fetchWithAuth(`${API_BASE}/analyze/followup-answers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, conversation }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to process follow-up answers' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function sendLiveChatMessage(messages, signal) {
  const response = await fetchWithAuth(`${API_BASE}/analyze/live-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Live chat failed' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}



export async function healthCheck() {
  const response = await fetch(`${API_BASE}/health`);
  return response.json();
}

export async function getAssessments() {
  const response = await fetchWithAuth(`${API_BASE}/history`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

export async function getAssessment(id) {
  const response = await fetchWithAuth(`${API_BASE}/history/${id}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

export async function generateFlowchart(scoredSteps) {
  const response = await fetchWithAuth(`${API_BASE}/flowchart/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scored_steps: scoredSteps }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function deleteAssessment(id) {
  const response = await fetchWithAuth(`${API_BASE}/history/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function updateAssessmentBpmn(id, bpmnXml) {
  const response = await fetchWithAuth(`${API_BASE}/history/${id}/bpmn`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bpmn_xml: bpmnXml }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function updateAssessmentChat(id, chatHistory) {
  const response = await fetchWithAuth(`${API_BASE}/history/${id}/chat`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_history: chatHistory }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function updateAssessmentHourlyRate(id, hourlyRate) {
  const response = await fetchWithAuth(`${API_BASE}/history/${id}/hourly-rate`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hourly_rate: hourlyRate }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function transcribeAudio(audioBlob) {
  const formData = new FormData();
  formData.append('file', audioBlob, 'recording.webm');

  const response = await fetchWithAuth(`${API_BASE}/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Transcription failed' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function generateAudioOverview(id, language) {
  const response = await fetchWithAuth(`${API_BASE}/history/${id}/audio-overview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to generate audio overview' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

// ── PDD / SDD Document APIs ───────────────────────────────────────────────────

export async function generateDocument(id, docType, force = false) {
  const response = await fetchWithAuth(`${API_BASE}/history/${id}/generate-document`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc_type: docType, force }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to generate document' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function updateDocument(id, docType, instruction, selectedText = null) {
  const response = await fetchWithAuth(`${API_BASE}/history/${id}/update-document`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc_type: docType, instruction, selected_text: selectedText }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to update document' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function saveDocumentManual(id, docType, content) {
  const response = await fetchWithAuth(`${API_BASE}/history/${id}/document/${docType}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to save document' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function downloadDocumentDocx(id, docType, images = []) {
  // POST so we can pass pre-rendered PNG snapshots of BPMN/SVG diagrams
  // captured from the DOM. The backend embeds these instead of dumping
  // raw XML/HTML into the Word doc.
  const response = await fetchWithAuth(`${API_BASE}/history/${id}/download-document?doc_type=${docType}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to download document' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `AP_${docType.toUpperCase()}_Document.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function uploadTemplate(id, docType, file) {
  const formData = new FormData();
  formData.append('doc_type', docType);
  formData.append('file', file);
  const response = await fetchWithAuth(`${API_BASE}/history/${id}/upload-template`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to upload template' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function getTemplateStatus(id) {
  const response = await fetchWithAuth(`${API_BASE}/history/${id}/template-status`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

export async function deleteTemplate(id, docType) {
  const response = await fetchWithAuth(`${API_BASE}/history/${id}/template?doc_type=${docType}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to delete template' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function chatWithAgent(contextData, messages, pendingDocEdits = []) {
  const response = await fetchWithAuth(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context_data: contextData,
      messages: messages,
      pending_doc_edits: pendingDocEdits.length > 0 ? pendingDocEdits : undefined
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to chat with agent' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

// ── Temporary Live Chat Session DB storage APIs ───────────────────────────────

export async function prepareLiveChatResume(language = null) {
  const response = await fetchWithAuth(`${API_BASE}/live-chat/prepare-resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to prepare resume session' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function saveLiveChatSession(messages, language = 'English') {
  const response = await fetchWithAuth(`${API_BASE}/live-chat/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, language }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to save live chat session' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function getLiveChatSession() {
  const response = await fetchWithAuth(`${API_BASE}/live-chat/session`, {
    method: 'GET',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to retrieve live chat session' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function deleteLiveChatSession() {
  const response = await fetchWithAuth(`${API_BASE}/live-chat/session`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to delete live chat session' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

// ── API Keys (public developer API) ────────────────────────────────────
export async function listApiKeys() {
  const response = await fetchWithAuth(`${API_BASE}/keys`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to load API keys' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function createApiKey(name, allowedModels = null) {
  const response = await fetchWithAuth(`${API_BASE}/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, allowed_models: allowedModels }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to create API key' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function revokeApiKey(keyId) {
  const response = await fetchWithAuth(`${API_BASE}/keys/${keyId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to revoke API key' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}
