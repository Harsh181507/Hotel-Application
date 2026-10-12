package com.hotelconcierge.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiException(val status: Int, message: String) : Exception(message)

/** Talks to the hotel server. Every call throws ApiException with a readable message on failure. */
object Api {
    val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        explicitNulls = false
        isLenient = true
    }

    val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        // A sleeping free Render server can take ~1 minute to wake up.
        .readTimeout(75, TimeUnit.SECONDS)
        .build()

    private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()

    fun host(url: String) = url.substringAfter("://").trimEnd('/')

    /**
     * server/token default to the logged-in session. With auth = false no token is sent
     * (logins, room info). A 401 on a logged-in call ends the session.
     */
    suspend fun call(
        method: String,
        path: String,
        body: JsonElement? = null,
        server: String? = null,
        auth: Boolean = true,
    ): String = withContext(Dispatchers.IO) {
        val session = SessionStore.session.value
        val base = (server ?: session?.server ?: SessionStore.staffServer).trimEnd('/')
        val payload = when {
            body != null -> json.encodeToString(JsonElement.serializer(), body).toRequestBody(JSON_TYPE)
            method in setOf("POST", "PUT", "PATCH") -> "{}".toRequestBody(JSON_TYPE)
            else -> null
        }
        val request = Request.Builder().url(base + path).method(method, payload).apply {
            if (auth && session != null) header("Authorization", "Bearer ${session.token}")
        }.build()

        val response = try {
            http.newCall(request).execute()
        } catch (e: IOException) {
            throw ApiException(0, "Cannot reach ${host(base)}. Check your internet connection.")
        }
        response.use {
            val text = it.body?.string().orEmpty()
            if (!it.isSuccessful) {
                val message = runCatching { json.parseToJsonElement(text).jsonObject["error"]?.jsonPrimitive?.content }
                    .getOrNull() ?: "Something went wrong (${it.code})"
                if (it.code == 401 && auth && server == null && session != null) SessionStore.clear(message)
                throw ApiException(it.code, message)
            }
            text
        }
    }

    suspend inline fun <reified T> get(path: String): T = json.decodeFromString(call("GET", path))
    suspend inline fun <reified T> post(path: String, body: JsonElement? = null): T = json.decodeFromString(call("POST", path, body))
    suspend inline fun <reified T> put(path: String, body: JsonElement): T = json.decodeFromString(call("PUT", path, body))
    suspend inline fun <reified T> patch(path: String, body: JsonElement): T = json.decodeFromString(call("PATCH", path, body))

    /** For calls whose answer we don't need. */
    suspend fun send(method: String, path: String, body: JsonElement? = null) {
        call(method, path, body)
    }
}

/** Builds a JSON body: jsonOf("status" to "done", "quantity" to 2). */
fun jsonOf(vararg pairs: Pair<String, Any?>): JsonObject = JsonObject(pairs.associate { (k, v) -> k to toJson(v) })

private fun toJson(value: Any?): JsonElement = when (value) {
    null -> JsonNull
    is JsonElement -> value
    is String -> JsonPrimitive(value)
    is Number -> JsonPrimitive(value)
    is Boolean -> JsonPrimitive(value)
    is List<*> -> JsonArray(value.map { toJson(it) })
    is Map<*, *> -> JsonObject(value.entries.associate { (k, v) -> k.toString() to toJson(v) })
    else -> JsonPrimitive(value.toString())
}
