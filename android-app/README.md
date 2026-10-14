# Hotel Concierge — Android app (Kotlin)

One native app for **guests** and **hotel staff**, written in Kotlin with Jetpack Compose.
It talks to the same server as the website (`../backend`).

- **Guests:** tap *I'm a guest* → the app's own **QR scanner** reads the code in the room (works offline, Google's
  on-device reader) → Guest ID + access code → **Answers**, **Order** (in-room dining with live tracking and
  bill), **Book** (restaurant table or vehicle), **Bill** (every item Paid / Unpaid; pay with the hotel's UPI QR
  or straight from a UPI app, then send the UTR), **Desk** chat, room cleaning / Do-not-disturb.
- **Staff:** tap *Hotel staff* → log in. Each role gets its own tabs:

  | Role | Tabs |
  |---|---|
  | Admin / Front desk | Inbox, Tasks, Orders, Cleaning, More (Rooms & check-in, Bills & payments, Table bookings, Vehicles, Menu, Answers, Team\*, Settings\*) |
  | Housekeeping | My rooms, Tasks |
  | Kitchen | Orders, Tasks, Menu (sold-out switches), More (Table bookings) |
  | Maintenance | Tasks |

  \* admin only. While logged in, an **"On duty"** notification keeps the app connected, so new chats, tasks,
  orders and late warnings ring the phone even when the app is closed. Logging out stops it.
- **Rooms:** check guests in (Guest ID suggested from the name), show the one-time access code, make a new code,
  check out with the final bill, and show/share the room's QR code (made on the phone).
- **Bills:** UPI payments to confirm, every room's balance, add restaurant bills / extras / discounts / advances,
  mark items paid (cash, card, UPI), and print or save the final bill as PDF.

## Get the app

The ready-made app is **`../builds/HotelConcierge.apk`**. Copy it to an Android phone (8.0 or newer) and open it
to install (allow "install unknown apps" once). It connects to `https://anemos-concierge.onrender.com`.
Staff of another hotel tap **Change** on the staff login screen to enter their hotel's server address.
Guests never type a server: it comes from the QR code they scan.

## Build it yourself

Needs **Android Studio** (it includes Java and the Android SDK).

- **Android Studio:** *File → Open* → choose this `android-app` folder → wait for Gradle → ▶ Run.
- **Command line** (Windows, from this folder):

  ```bash
  gradlew.bat assembleDebug
  ```

  ```bash
  gradlew.bat assembleRelease
  ```

  Results: `app/build/outputs/apk/debug/app-debug.apk` and `app/build/outputs/apk/release/app-release.apk`.
  If Gradle says it can't find Java, set `JAVA_HOME` to Android Studio's `jbr` folder (or any JDK 17+).

| Build | Name on the phone | Server | Use it for |
|---|---|---|---|
| debug | Hotel Concierge (test) | `http://10.0.2.2:4000` (this PC, seen from the emulator) | Testing with `npm run dev` |
| release | Hotel Concierge | `https://anemos-concierge.onrender.com` | Giving to hotels |

Both can be installed side by side. **Never give out the debug build**: it allows unencrypted connections.
To point the release build at another server, change `DEFAULT_SERVER` in `app/build.gradle.kts`.

### Testing on the emulator with your local server

1. In the main folder run `npm run dev` (database + API on port 4000).
2. Run the **debug** build on an emulator. Staff demo login: `admin@anemos.local` / `ChangeMe123!`.
3. Guests: in the website or the app go to **Rooms → QR**, then open the room link in the emulator, e.g.

   ```bash
   adb shell am start -n com.hotelconcierge.app.debug/com.hotelconcierge.app.MainActivity -a android.intent.action.VIEW -d "http://10.0.2.2:4000/guest/?room=ROOM_TOKEN"
   ```

   (On a real phone, scan the printed QR code instead.)

## Your release key (needed for the Play Store)

Without a key file, release builds are signed with this computer's *debug* key. That installs fine, but an update
built on a different computer won't install over it, and the Play Store won't accept it. To use your own key:

1. Android Studio → *Build → Generate Signed App Bundle / APK* → *Create new…* → save e.g. `hotel-release.jks`
   **outside** this project (and back it up: if you lose it you can never update the app).
2. Create `android-app/keystore.properties` (it's git-ignored, never commit it):

   ```properties
   storeFile=C:/Users/you/keys/hotel-release.jks
   storePassword=your-store-password
   keyAlias=your-key-alias
   keyPassword=your-key-password
   ```

3. `gradlew.bat assembleRelease` (APK) or `gradlew.bat bundleRelease` (`.aab` for the Play Store).

## Code layout

```
app/src/main/java/com/hotelconcierge/app/
  MainActivity.kt, App.kt     start-up; room links (…/guest/?room=…) open the guest login
  data/
    Api.kt                    server calls (OkHttp) with readable error messages
    Live.kt                   live updates (Socket.IO): chat, tasks, orders, rooms
    Models.kt                 the server's data shapes
    Session.kt                who is logged in (kept on the phone)
    QrLink.kt                 reads a room QR link → server + room token
  service/
    OnDutyService.kt          staff "On duty": stays connected, raises alerts
    Alerts.kt                 notification channels, sound + vibration
  ui/
    AppRoot.kt                start screen → scanner / logins → guest or staff home
    start/StartScreen.kt      "I'm a guest" / "Hotel staff"
    guest/                    ScanScreen (camera + QR), GuestLogin, Answers, Order, Front desk chat
    staff/                    Inbox + chat, Tasks, Kitchen orders, Housekeeping, Rooms, Menu editor,
                              Answers editor, Team, Settings
    common/                   shared chat panel and UI pieces
    theme/Theme.kt            colours and fonts (same look as the website)
```

Main libraries: Jetpack Compose (Material 3), OkHttp, kotlinx.serialization, socket.io-client-java,
CameraX + ML Kit barcode scanning (bundled, offline), ZXing (QR images), Coil (menu photos).
