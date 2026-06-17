import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gainlog.app',
  appName: 'GAINLOG: Protocol Tracker',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
