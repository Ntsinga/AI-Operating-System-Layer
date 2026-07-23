package com.ntsinga.mobile

import android.Manifest
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

private const val LOCATION_TIMEOUT_MS = 15_000L

class LocationModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "LocationManagerModule"

  @ReactMethod
  fun getCurrentLocation(promise: Promise) {
    PermissionHelper.requestPermission(reactContext, Manifest.permission.ACCESS_FINE_LOCATION, promise) {
      resolveCurrentLocation(promise)
    }
  }

  private fun resolveCurrentLocation(promise: Promise) {
    try {
      val locationManager = reactContext.getSystemService(android.content.Context.LOCATION_SERVICE) as LocationManager

      val bestKnown = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
        .filter { locationManager.isProviderEnabled(it) }
        .mapNotNull { runCatching { locationManager.getLastKnownLocation(it) }.getOrNull() }
        .maxByOrNull { it.time }

      if (bestKnown != null) {
        promise.resolve(locationToMap(bestKnown))
        return
      }

      requestFreshLocation(locationManager, promise)
    } catch (error: Exception) {
      promise.reject("LOCATION_GET_CURRENT_LOCATION_FAILED", error)
    }
  }

  private fun requestFreshLocation(locationManager: LocationManager, promise: Promise) {
    val provider = when {
      locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
      locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
      else -> {
        promise.reject("LOCATION_PROVIDER_UNAVAILABLE", "No enabled location provider (enable GPS or network location).")
        return
      }
    }

    val mainHandler = Handler(Looper.getMainLooper())
    var settled = false

    val listener = object : LocationListener {
      override fun onLocationChanged(location: Location) {
        if (settled) return
        settled = true
        locationManager.removeUpdates(this)
        promise.resolve(locationToMap(location))
      }

      @Deprecated("Deprecated in Java")
      override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
      override fun onProviderEnabled(provider: String) {}
      override fun onProviderDisabled(provider: String) {}
    }

    mainHandler.post {
      locationManager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
    }

    mainHandler.postDelayed({
      if (!settled) {
        settled = true
        locationManager.removeUpdates(listener)
        promise.reject("LOCATION_TIMEOUT", "Timed out waiting for a location fix.")
      }
    }, LOCATION_TIMEOUT_MS)
  }

  private fun locationToMap(location: Location) = Arguments.createMap().apply {
    putDouble("latitude", location.latitude)
    putDouble("longitude", location.longitude)
    putDouble("accuracyMeters", location.accuracy.toDouble())
    putString("provider", location.provider)
    putDouble("timestampMillis", location.time.toDouble())
  }
}
