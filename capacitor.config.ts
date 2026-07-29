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
      launchAutoHide: false,
      backgroundColor: "#09090e",
      showSpinner: false
    },
    StatusBar: {
      style: "dark",
      backgroundColor: "#09090e"
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true
    }
  }
};

export default config;
