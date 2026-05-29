export interface SubjectData {
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  noteOrder: string[];
  notes: Array<{
    id: string;
    title: string;
    metaPath: string;
    notePath: string;
  }>;
}
