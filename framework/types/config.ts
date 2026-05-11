export interface AppConfig {
  baseUrl: string;
  apiBaseUrl: string;
  timeout: number;
  implicitWait: number;
  retryAttempts: number;
}

export interface EnvironmentConfig {
  name: string;
  app: AppConfig;
  credentials: {
    username: string;
    password: string;
  };
}

export interface FrameworkConfig {
  environment: string;
  platform: 'ios' | 'android' | 'web';
  headless: boolean;
  screenshotOnFailure: boolean;
  videoRecording: boolean;
  allureEnabled: boolean;
}
