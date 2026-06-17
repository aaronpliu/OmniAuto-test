export interface AppConfig {
  baseUrl: string;
  apiBaseUrl: string;
  timeout: number;
  implicitWait: number;
  retryAttempts: number;
}

export interface ApplicationsConfig {
  androidApk?: string;
  iosApp?: string;
}

export interface EnvironmentConfig {
  name: string;
  app: AppConfig;
  credentials: {
    username: string;
    password: string;
  };
  applications?: ApplicationsConfig;
}

export interface FrameworkConfig {
  environment: string;
  platform: 'ios' | 'android' | 'web';
  headless: boolean;
  screenshotOnFailure: boolean;
  videoRecording: boolean;
  allureEnabled: boolean;
}
