import api from "./client";

export const login = (username, password, website = "") =>
  api.post("/auth/login", { username, password, website }).then((r) => r.data);

export const register = (data) =>
  api.post("/auth/register", data).then((r) => r.data);

export const getMe = () => api.get("/auth/me").then((r) => r.data);

export const changePassword = (currentPassword, newPassword) =>
  api
    .patch("/auth/change-password", { currentPassword, newPassword })
    .then((r) => r.data);
