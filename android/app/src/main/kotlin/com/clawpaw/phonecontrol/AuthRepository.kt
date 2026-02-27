package com.clawpaw.phonecontrol

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

// Data access layer — calls backend REST APIs
class AuthRepository(private val backendBaseUrl: String) {
    private val client = OkHttpClient()
    private val json = "application/json".toMediaType()

    data class LoginResult(val uid: String)

    /** Anonymous login — registers a device by its generated UUID. */
    fun loginAnonymous(deviceId: String): LoginResult {
        val body = JSONObject().apply { put("deviceId", deviceId) }
            .toString().toRequestBody(json)

        val request = Request.Builder()
            .url("$backendBaseUrl/api/auth/anonymous")
            .post(body)
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) error("Anonymous login failed: ${response.code}")
            val rb = response.body?.string() ?: error("Empty response")
            return LoginResult(uid = JSONObject(rb).getString("uid"))
        }
    }

    data class SshCreds(val username: String, val password: String, val adbPort: Int)

    /**
     * Provision SSH credentials for this uid.
     * Server creates a Linux user, assigns an ADB port, and returns all three.
     */
    fun provisionSsh(uid: String, secret: String): SshCreds {
        val body = JSONObject().apply { put("uid", uid) }
            .toString().toRequestBody(json)

        val request = Request.Builder()
            .url("$backendBaseUrl/api/ssh/provision")
            .header("x-clawpaw-secret", secret)
            .post(body)
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) error("SSH provision failed: ${response.code}")
            val rb = response.body?.string() ?: error("Empty response")
            val obj = JSONObject(rb)
            return SshCreds(
                username = obj.getString("username"),
                password = obj.getString("password"),
                adbPort  = obj.getInt("adbPort"),
            )
        }
    }

    /** Generate (or regenerate) a clawpaw secret for this uid. Returns the new secret. */
    fun generateSecret(uid: String): String {
        val body = JSONObject().apply { put("uid", uid) }
            .toString().toRequestBody(json)

        val request = Request.Builder()
            .url("$backendBaseUrl/api/secret/generate")
            .post(body)
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) error("generateSecret failed: ${response.code}")
            val rb = response.body?.string() ?: error("Empty response")
            return JSONObject(rb).getString("secret")
        }
    }

    /**
     * Fetch the clawpaw_secret for this uid.
     * Returns null if no secret has been generated yet.
     */
    fun fetchSecret(uid: String): String? {
        val request = Request.Builder()
            .url("$backendBaseUrl/api/secret?uid=${uid}")
            .get()
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) error("fetchSecret failed: ${response.code}")
            val rb = response.body?.string() ?: error("Empty response")
            val secret = JSONObject(rb).optString("secret", "")
            return secret.ifBlank { null }
        }
    }
}
