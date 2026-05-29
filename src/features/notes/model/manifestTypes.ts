export interface AppManifest {
  schemaVersion: number;
  appName: string;
  appVersion: string;
  subjectOrder: string[];
  subjects: Array<{
    id: string;
    name: string;
    path: string;
  }>;
}
