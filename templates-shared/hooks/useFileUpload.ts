import { useState, useCallback, useRef } from "react";
import { apiClient } from "../core";

export function useFileUpload() {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const upload = useCallback(
    async (url: string, formData: FormData, config?: any) => {
      setIsUploading(true);
      setUploadProgress(0);
      setError(null);

      abortControllerRef.current = new AbortController();

      try {
        const response = await apiClient.post(url, formData, {
          ...config,
          signal: abortControllerRef.current.signal,
          headers: {
            "Content-Type": "multipart/form-data",
            ...config?.headers,
          },
          onUploadProgress: (progressEvent: any) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / (progressEvent.total || 1),
            );
            setUploadProgress(percentCompleted);
          },
        });
        return response;
      } catch (err: any) {
        if (err?.name === "CanceledError" || err?.message === "canceled") {
          // Handle abort gracefully without throwing a severe error
          console.log("Upload aborted by user");
          return null;
        } else {
          setError(err);
          throw err;
        }
      } finally {
        setIsUploading(false);
        abortControllerRef.current = null;
        // Clear progress after a short delay for smooth UI transition
        setTimeout(() => {
          setUploadProgress(0);
        }, 1000);
      }
    },
    [],
  );

  return { upload, abort, uploadProgress, isUploading, error };
}
