// Builds the Android staff app (APK) in one step.
//   npm run android:apk            -> ../builds/AnemosStaff.apk      (talks to the live server in .env.android)
//   npm run android:apk -- --dev   -> ../builds/AnemosStaff-dev.apk  (test build for the emulator on this PC)
// Needs Java 21 and the Android SDK (both come with Android Studio).
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dev = process.argv.includes('--dev');
const root = resolve(import.meta.dirname, '..');
const env = { ...process.env, CAP_DEV: dev ? '1' : '' };

// Find Java and the Android SDK in their usual Windows places if not set.
const firstExisting = (...paths) => paths.find((p) => p && existsSync(p));
if (process.platform === 'win32') {
  env.JAVA_HOME ||= firstExisting('C:\\Program Files\\Java\\jdk-21', 'C:\\Program Files\\Android\\Android Studio\\jbr');
  env.ANDROID_HOME ||= firstExisting(join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk'));
}
if (!env.JAVA_HOME || !env.ANDROID_HOME) {
  console.error('Set JAVA_HOME (Java 21) and ANDROID_HOME (Android SDK), or install Android Studio.');
  process.exit(1);
}
writeFileSync(join(root, 'android', 'local.properties'), `sdk.dir=${env.ANDROID_HOME.replace(/\\/g, '\\\\')}\n`);

const run = (cmd, cwd = root) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd, env, stdio: 'inherit' });
};

run(`npx vite build --mode ${dev ? 'android-dev' : 'android'}`);
run('npx cap sync android');
const gradlew = join(root, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
run(`"${gradlew}" assembleDebug --console=plain`, join(root, 'android'));

const out = resolve(root, '..', 'builds');
mkdirSync(out, { recursive: true });
const apk = join(out, dev ? 'AnemosStaff-dev.apk' : 'AnemosStaff.apk');
copyFileSync(join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'), apk);
console.log(`\nAPK ready: ${apk}`);
