import type { CapacitorConfig } from '@capacitor/cli';

// Android staff app. Build it with:  npm run android:apk
// CAP_DEV=1 makes a test build that may talk to a plain-http server on this
// computer (the Android emulator reaches it at http://10.0.2.2:4000).
const devBuild = process.env.CAP_DEV === '1';

const config: CapacitorConfig = {
  appId: 'com.anemos.concierge.staff',
  appName: 'Anemos Staff',
  webDir: 'dist',
  server: { androidScheme: 'https', cleartext: devBuild },
  android: { allowMixedContent: devBuild },
};

export default config;
