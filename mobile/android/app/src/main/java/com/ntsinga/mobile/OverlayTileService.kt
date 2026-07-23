package com.ntsinga.mobile

import android.graphics.drawable.Icon
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.provider.Settings

/**
 * Quick Settings activation for the system overlay. The tile is deliberately only a
 * start/stop control; the assistant UI and tool execution remain owned by the React Native
 * app and the existing OverlayService.
 */
class OverlayTileService : TileService() {
  override fun onStartListening() {
    super.onStartListening()
    updateTile()
  }

  override fun onClick() {
    super.onClick()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
      // A Quick Settings tile cannot show the special-permission Settings screen reliably in
      // the background. Leave the tile inactive; the app's OverlayControlCard handles grant.
      updateTile()
      return
    }

    if (OverlayService.isRunning) {
      OverlayService.stop(this)
    } else {
      runCatching { OverlayService.start(this) }
    }
    updateTile()
  }

  private fun updateTile() {
    qsTile?.apply {
      state = if (OverlayService.isRunning) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
      label = if (OverlayService.isRunning) "AI-OS on" else "AI-OS overlay"
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        icon = Icon.createWithResource(this@OverlayTileService, R.mipmap.ic_launcher)
      }
      updateTile()
    }
  }
}
