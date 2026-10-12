# Release build shrinking (R8).
# kotlinx.serialization, OkHttp, CameraX and ML Kit ship their own rules.

# Socket.IO / Engine.IO client (uses org.json and reflection-free OkHttp)
-keep class io.socket.** { *; }
-dontwarn io.socket.**

# Optional TLS providers OkHttp looks for at runtime
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
