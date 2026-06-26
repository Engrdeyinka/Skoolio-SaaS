/**
 * Core.js
 *
 * Shared integration helpers: file upload, LLM invocation, email sending.
 * Backed directly by Supabase Storage and the Anthropic API.
 */
import { supabase } from '@/api/supabaseClient';

/** Upload a File object to Supabase Storage and return its public URL. */
export async function UploadFile({ file }) {
  const fileName = `${Date.now()}_${file.name}`;
  const { data, error } = await supabase.storage.from('uploads').upload(fileName, file);
  if (error) throw error;
  const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(data.path);
  return { file_url: urlData.publicUrl };
}

/** Placeholder — wire up an email provider when ready. */
export async function SendEmail(params) {
  console.warn('SendEmail: Not yet connected to email provider');
  return { success: true, message: 'Email sending not configured yet' };
}

/**
 * Invoke Claude via the Anthropic Messages API.
 *
 * @param {object} params
 * @param {string}   params.prompt
 * @param {string[]} [params.file_urls]          – Public URLs to attach as images/PDFs
 * @param {object}   [params.response_json_schema] – Force structured JSON output
 */
export async function InvokeLLM({ prompt, file_urls, response_json_schema } = {}) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your-anthropic-api-key-here') {
    throw new Error('VITE_ANTHROPIC_API_KEY is not set in .env — add your Anthropic API key.');
  }

  const content = [];

  // Attach each file as base64
  if (file_urls && file_urls.length > 0) {
    for (const url of file_urls) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch uploaded file: ${res.status}`);
      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();

      // Chunked btoa to avoid call-stack overflow on large files
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.byteLength; i += chunkSize) {
        binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
      }
      const base64 = btoa(binary);

      const mediaType =
        blob.type || (url.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

      if (mediaType === 'application/pdf') {
        content.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        });
      } else {
        const imgType = ['image/png', 'image/gif', 'image/webp'].includes(mediaType)
          ? mediaType
          : 'image/jpeg';
        content.push({ type: 'image', source: { type: 'base64', media_type: imgType, data: base64 } });
      }
    }
  }

  content.push({ type: 'text', text: prompt });

  // Use tool_use for structured output, plain text otherwise
  let requestBody;
  if (response_json_schema) {
    requestBody = {
      model: 'claude-opus-4-5',
      max_tokens: 8192,
      tools: [{
        name: 'structured_response',
        description: 'Return a structured JSON response matching the given schema.',
        input_schema: response_json_schema,
      }],
      tool_choice: { type: 'tool', name: 'structured_response' },
      messages: [{ role: 'user', content }],
    };
  } else {
    requestBody = {
      model: 'claude-opus-4-5',
      max_tokens: 8192,
      messages: [{ role: 'user', content }],
    };
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API error: ${res.status}`);
  }

  const data = await res.json();

  if (response_json_schema) {
    const toolBlock = data.content?.find(b => b.type === 'tool_use');
    if (toolBlock?.input) return toolBlock.input;
    throw new Error('AI did not return a structured response.');
  }

  const text = data.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return JSON.parse(jsonMatch[0]);
  return text;
}

/** Placeholder — wire up document extraction when ready. */
export async function ExtractDataFromUploadedFile(params) {
  console.warn('ExtractDataFromUploadedFile: Not yet connected');
  return { data: [] };
}
