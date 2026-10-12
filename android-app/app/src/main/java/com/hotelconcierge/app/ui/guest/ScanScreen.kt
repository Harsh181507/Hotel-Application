package com.hotelconcierge.app.ui.guest

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.OptIn
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.FlashlightOff
import androidx.compose.material.icons.outlined.FlashlightOn
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.NoPhotography
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.hotelconcierge.app.data.QrLink
import com.hotelconcierge.app.data.RoomLink
import com.hotelconcierge.app.ui.common.Field
import com.hotelconcierge.app.ui.common.PrimaryButton
import com.hotelconcierge.app.ui.theme.HC
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Guest step 1: scan the QR code printed in the room. */
@Composable
fun ScanScreen(onBack: () -> Unit, onFound: (RoomLink) -> Unit) {
    val context = LocalContext.current
    var hasCamera by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    var asked by remember { mutableStateOf(false) }
    val askCamera = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        hasCamera = it
        asked = true
    }
    LaunchedEffect(Unit) { if (!hasCamera) askCamera.launch(Manifest.permission.CAMERA) }

    var torch by remember { mutableStateOf(false) }
    var camera by remember { mutableStateOf<Camera?>(null) }
    var notOurs by remember { mutableStateOf(false) }
    var typing by remember { mutableStateOf(false) }
    val onFoundNow by rememberUpdatedState(onFound)

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (hasCamera) {
            CameraPreview(
                onCamera = { camera = it },
                onQr = { raw ->
                    val link = QrLink.parse(raw)
                    if (link != null) onFoundNow(link) else notOurs = true
                },
            )
            Viewfinder()
        } else {
            Column(
                Modifier.fillMaxSize().padding(32.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(Icons.Outlined.NoPhotography, null, tint = Color.White, modifier = Modifier.size(48.dp))
                Spacer(Modifier.height(12.dp))
                Text(
                    if (asked) "Camera permission is needed to scan the room QR code." else "Allow the camera to scan the QR code in your room.",
                    color = Color.White, textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(16.dp))
                PrimaryButton("Allow camera", onClick = { askCamera.launch(Manifest.permission.CAMERA) })
            }
        }

        // Top bar
        Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack, colors = IconButtonDefaults.iconButtonColors(containerColor = Color.Black.copy(alpha = 0.4f), contentColor = Color.White)) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back")
            }
            Text("Scan the room QR code", color = Color.White, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(start = 8.dp))
        }

        // Bottom controls
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                if (notOurs) "That QR code isn't a room code. Try the one placed in your room." else "Point the camera at the QR code in your room",
                color = Color.White, textAlign = TextAlign.Center,
                modifier = Modifier.background(Color.Black.copy(alpha = 0.45f), CircleShape).padding(horizontal = 16.dp, vertical = 8.dp),
            )
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                if (hasCamera) {
                    IconButton(
                        onClick = { torch = !torch; camera?.cameraControl?.enableTorch(torch) },
                        colors = IconButtonDefaults.iconButtonColors(containerColor = if (torch) Color.White else Color.Black.copy(alpha = 0.45f), contentColor = if (torch) Color.Black else Color.White),
                        modifier = Modifier.size(52.dp),
                    ) { Icon(if (torch) Icons.Outlined.FlashlightOn else Icons.Outlined.FlashlightOff, "Torch") }
                }
                TextButton(onClick = { typing = true }) {
                    Icon(Icons.Outlined.Link, null, tint = Color.White)
                    Text("  Enter the room link instead", color = Color.White)
                }
            }
        }
    }

    if (typing) {
        var text by remember { mutableStateOf("") }
        var error by remember { mutableStateOf<String?>(null) }
        AlertDialog(
            onDismissRequest = { typing = false },
            title = { Text("Room link") },
            text = {
                Column {
                    Text("Paste the link from the room card, e.g. https://hotel…/guest/?room=…", color = HC.Muted)
                    Spacer(Modifier.height(12.dp))
                    Field(text, { text = it; error = null }, "Room link", supporting = error)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val link = QrLink.parse(text)
                    if (link == null) error = "That doesn't look like a room link" else { typing = false; onFound(link) }
                }) { Text("Continue") }
            },
            dismissButton = { TextButton(onClick = { typing = false }) { Text("Cancel") } },
            containerColor = HC.Surface,
        )
    }
}

/** Camera preview + Google's on-device QR reader (works offline). */
@OptIn(ExperimentalGetImage::class)
@Composable
private fun CameraPreview(onCamera: (Camera) -> Unit, onQr: (String) -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val onQrNow by rememberUpdatedState(onQr)
    val done = remember { AtomicBoolean(false) }
    val executor = remember { Executors.newSingleThreadExecutor() }
    val scanner = remember {
        BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build())
    }
    var provider by remember { mutableStateOf<ProcessCameraProvider?>(null) }

    DisposableEffect(Unit) {
        onDispose {
            provider?.unbindAll()
            scanner.close()
            executor.shutdown()
        }
    }

    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { ctx ->
            val view = PreviewView(ctx).apply {
                scaleType = PreviewView.ScaleType.FILL_CENTER
                // TextureView: draws inside the Compose layout (a SurfaceView can stay black behind it on some phones).
                implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            }
            val future = ProcessCameraProvider.getInstance(ctx)
            future.addListener({
                val cameraProvider = future.get()
                provider = cameraProvider
                val preview = Preview.Builder().build().also { it.setSurfaceProvider(view.surfaceProvider) }
                val analysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                analysis.setAnalyzer(executor) { frame ->
                    val media = frame.image
                    if (media == null || done.get()) {
                        frame.close()
                        return@setAnalyzer
                    }
                    scanner.process(InputImage.fromMediaImage(media, frame.imageInfo.rotationDegrees))
                        .addOnSuccessListener { codes ->
                            val raw = codes.firstNotNullOfOrNull { it.rawValue } ?: return@addOnSuccessListener
                            if (QrLink.parse(raw) == null || done.compareAndSet(false, true)) {
                                ContextCompat.getMainExecutor(ctx).execute { onQrNow(raw) }
                            }
                        }
                        .addOnCompleteListener { frame.close() }
                }
                runCatching {
                    cameraProvider.unbindAll()
                    onCamera(cameraProvider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis))
                }
            }, ContextCompat.getMainExecutor(context))
            view
        },
    )
}

/** Dark overlay with a clear rounded square where the QR code should go. */
@Composable
private fun Viewfinder() {
    Canvas(Modifier.fillMaxSize().graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)) {
        val side = size.minDimension * 0.68f
        val topLeft = Offset((size.width - side) / 2, (size.height - side) / 2.4f)
        val radius = CornerRadius(36f, 36f)
        drawRect(Color.Black.copy(alpha = 0.55f))
        drawRoundRect(Color.Transparent, topLeft, Size(side, side), radius, blendMode = BlendMode.Clear)
        drawRoundRect(HC.Bg, topLeft, Size(side, side), radius, style = Stroke(width = 6f))
    }
}
