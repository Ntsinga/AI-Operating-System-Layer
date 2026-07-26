package com.aioperatingsystem

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.NetworkCapabilities
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.net.HttpURLConnection
import java.net.URL

class NetworkInfoModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AiosNetworkInfo"

  @ReactMethod
  fun diagnoseNetwork(promise: Promise) {
    Thread {
      try {
        val manager = reactContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = manager.activeNetwork
        val capabilities = network?.let { manager.getNetworkCapabilities(it) }
        val linkProperties = network?.let { manager.getLinkProperties(it) }
        val transports = Arguments.createArray()

        if (capabilities != null) {
          if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) transports.pushString("wifi")
          if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) transports.pushString("cellular")
          if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) transports.pushString("ethernet")
          if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) transports.pushString("vpn")
          if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH)) transports.pushString("bluetooth")
        }

        val latency = connectivityLatency()
        val result = Arguments.createMap().apply {
          putBoolean("connected", network != null && capabilities != null)
          putBoolean("validated", capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true)
          putBoolean("metered", manager.isActiveNetworkMetered)
          putArray("transports", transports)
          putDouble("latencyMs", latency?.first?.toDouble() ?: -1.0)
          putInt("httpStatus", latency?.second ?: -1)
          putArray("dnsServers", dnsServers(linkProperties))
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && capabilities != null) {
            putInt("signalStrength", capabilities.signalStrength)
          } else {
            putInt("signalStrength", -1)
          }
        }
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("NETWORK_INFO_DIAGNOSE_FAILED", error)
      }
    }.start()
  }

  @ReactMethod
  fun runNetworkTest(samples: Int, promise: Promise) {
    Thread {
      try {
        val count = samples.coerceIn(1, 5)
        val latencies = Arguments.createArray()
        var successful = 0
        var total = 0L
        var minimum = Long.MAX_VALUE
        var maximum = 0L
        repeat(count) {
          val result = connectivityLatency()
          val value = result?.first ?: -1L
          latencies.pushInt(value.toInt())
          if (value >= 0L && result?.second == 204) { successful++; total += value; minimum = minOf(minimum, value); maximum = maxOf(maximum, value) }
        }
        promise.resolve(Arguments.createMap().apply {
          putInt("samples", count); putArray("latenciesMs", latencies)
          putInt("successfulSamples", successful); putDouble("packetLossPercent", ((count - successful) * 100.0) / count)
          putDouble("averageLatencyMs", if (successful > 0) total.toDouble() / successful else -1.0)
          putLong("minLatencyMs", if (successful > 0) minimum else -1L); putLong("maxLatencyMs", if (successful > 0) maximum else -1L)
        })
      } catch (error: Exception) { promise.reject("NETWORK_TEST_FAILED", error) }
    }.start()
  }

  private fun dnsServers(linkProperties: LinkProperties?): com.facebook.react.bridge.WritableArray {
    val result = Arguments.createArray()
    linkProperties?.dnsServers?.forEach { result.pushString(it.hostAddress) }
    return result
  }

  private fun connectivityLatency(): Pair<Long, Int>? {
    return try {
      val started = System.nanoTime()
      val connection = (URL("https://connectivitycheck.gstatic.com/generate_204").openConnection() as HttpURLConnection).apply {
        connectTimeout = 4_000
        readTimeout = 4_000
        instanceFollowRedirects = false
        useCaches = false
        requestMethod = "GET"
      }
      val status = connection.responseCode
      connection.disconnect()
      Pair((System.nanoTime() - started) / 1_000_000L, status)
    } catch (_: Exception) {
      null
    }
  }
}
