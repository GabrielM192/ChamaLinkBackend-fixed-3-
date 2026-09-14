import { apiClient } from './client';

export interface MkobaImportResult {
  totalSubmitted: number;
  successfullyProcessed: number;
  ignoredDuplicates: number;
  totalFinesDeducted: number;
  totalWelfareAdded: number;
  warnings: string[];
}

export async function uploadMkobaStatement(groupId: string, file: File): Promise<MkobaImportResult> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post<MkobaImportResult>(
    `/MkobaImport/upload-statement/${groupId}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data;
}
