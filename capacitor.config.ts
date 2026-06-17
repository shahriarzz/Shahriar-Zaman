import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gainlog.app',
  appName: 'GAINLOG: Protocol Tracker',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'gainlog.app'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#09090e",
      showSpinner: false
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true
    }
  }
};

export default config;
