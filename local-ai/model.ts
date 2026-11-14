import { prebuiltAppConfig } from '@mlc-ai/web-llm'
export const MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'
const base = prebuiltAppConfig.model_list.find(m => m.model_id === MODEL_ID)!
export const MODEL_CONFIG = { model_list: [{ ...base,
  model: `${base.model}/resolve/9bd564b064631febf14deadcac492efb761d60c3/`,
  model_lib: base.model_lib.replace('/main/', '/146ed9cd4b4062e967b017fd2291f7106b50599f/'),
}], cacheBackend: 'indexeddb' as const }
