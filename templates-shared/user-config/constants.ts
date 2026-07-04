// Edit this file to configure your API Base URL
// For React/Vite projects, uncomment the next line and comment the process.env line
// export const baseURL = import.meta.env.VITE_API_BASE_URL || "https://api.example.com";
export const baseURL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.example.com";

export const unwrapResponseData = false; // Set to true if your API wraps responses in a 'data' object
