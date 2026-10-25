import API from "./axios";
import { asList } from "./home";

// Student side of official schedules: /setup/:setupId/official/...
// Request bodies for join-preview, join and leave are validated server-side and marked
// [confirm] in the API docs, so the exact fields may need adjusting once you have the validators.

const O = (id) => `/api/v1/setup/${id}/official`;
const data = (r) => r.data.data;

export const officialApi = {
  status: async (id) => data(await API.get(O(id))),
  schedules: async (id) => asList(data(await API.get(`${O(id)}/schedules`)), "schedules"),
  preview: async (id, body) => {
    const d = data(await API.post(`${O(id)}/join-preview`, body));
    return d?.preview ?? d;
  },
  join: async (id, body) => data(await API.post(`${O(id)}/join`, body)),
  leave: async (id, body = {}) => data(await API.post(`${O(id)}/leave`, body)),
  sync: async (id) => data(await API.post(`${O(id)}/sync`)),
  updates: async (id) => asList(data(await API.get(`${O(id)}/updates`)), "updates"),
  readAll: async (id) => data(await API.post(`${O(id)}/updates/read-all`)),
  read: async (id, updateId) => data(await API.post(`${O(id)}/updates/${updateId}/read`)),
  accept: async (id, updateId, body = {}) => data(await API.post(`${O(id)}/updates/${updateId}/accept`, body)),
  dismiss: async (id, updateId) => data(await API.post(`${O(id)}/updates/${updateId}/dismiss`)),
  optOuts: async (id) => asList(data(await API.get(`${O(id)}/opt-outs`)), "optOuts", "items"),
  restore: async (id, kind, itemId) => data(await API.delete(`${O(id)}/opt-outs/${kind}/${itemId}`)),
};