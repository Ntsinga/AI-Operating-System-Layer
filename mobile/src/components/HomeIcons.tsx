import { View } from 'react-native';

type IconProps = {
  color: string;
  size?: number;
};

// Monochrome icons drawn from Views, same convention as TabIcons.tsx: no emoji, no icon font,
// so each takes a single theme color. They are deliberately simple and recognizable at 20-24dp.

// Camera: a rounded body with a lens ring.
export function CameraIcon({ color, size = 22 }: IconProps) {
  return (
    <View
      style={{
        width: size,
        height: size * 0.74,
        borderRadius: size * 0.18,
        borderWidth: 2,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: size * 0.4,
          height: size * 0.4,
          borderRadius: size * 0.2,
          borderWidth: 2,
          borderColor: color,
        }}
      />
    </View>
  );
}

// Ride: two wheels joined by a frame, with a seat, so it reads as a motorbike.
export function RideIcon({ color, size = 22 }: IconProps) {
  const wheel = size * 0.36;
  return (
    <View style={{ width: size, height: size * 0.62, justifyContent: 'flex-end' }}>
      <View
        style={{
          position: 'absolute',
          left: wheel * 0.5,
          right: wheel * 0.5,
          top: size * 0.2,
          height: 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: size * 0.3,
          top: size * 0.08,
          width: size * 0.22,
          height: 3,
          borderRadius: 1.5,
          backgroundColor: color,
        }}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ width: wheel, height: wheel, borderRadius: wheel / 2, borderWidth: 2, borderColor: color }} />
        <View style={{ width: wheel, height: wheel, borderRadius: wheel / 2, borderWidth: 2, borderColor: color }} />
      </View>
    </View>
  );
}

// Social: two overlapping heads.
export function SocialIcon({ color, size = 22 }: IconProps) {
  return (
    <View style={{ width: size, height: size * 0.7, flexDirection: 'row', alignItems: 'flex-end' }}>
      <View
        style={{ width: size * 0.5, height: size * 0.5, borderRadius: size * 0.25, borderWidth: 2, borderColor: color }}
      />
      <View
        style={{
          width: size * 0.6,
          height: size * 0.6,
          borderRadius: size * 0.3,
          borderWidth: 2,
          borderColor: color,
          marginLeft: -size * 0.1,
        }}
      />
    </View>
  );
}

// Study: an open book.
export function StudyIcon({ color, size = 22 }: IconProps) {
  return (
    <View style={{ width: size, height: size * 0.72, flexDirection: 'row', gap: 2 }}>
      <View
        style={{
          flex: 1,
          borderWidth: 2,
          borderColor: color,
          borderTopLeftRadius: size * 0.2,
          borderBottomLeftRadius: size * 0.06,
          borderTopRightRadius: 2,
          borderBottomRightRadius: 2,
        }}
      />
      <View
        style={{
          flex: 1,
          borderWidth: 2,
          borderColor: color,
          borderTopRightRadius: size * 0.2,
          borderBottomRightRadius: size * 0.06,
          borderTopLeftRadius: 2,
          borderBottomLeftRadius: 2,
        }}
      />
    </View>
  );
}

// Mic: a capsule over a small cradle.
export function MicIcon({ color, size = 22 }: IconProps) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      <View style={{ width: size * 0.38, height: size * 0.6, borderRadius: size * 0.19, backgroundColor: color }} />
      <View
        style={{
          width: size * 0.62,
          height: size * 0.28,
          marginTop: -size * 0.06,
          borderWidth: 2,
          borderTopWidth: 0,
          borderColor: color,
          borderBottomLeftRadius: size * 0.31,
          borderBottomRightRadius: size * 0.31,
        }}
      />
    </View>
  );
}

// Send: a right-pointing triangle.
export function SendIcon({ color, size = 20 }: IconProps) {
  return (
    <View
      style={{
        width: 0,
        height: 0,
        marginLeft: size * 0.1,
        borderTopWidth: size * 0.32,
        borderBottomWidth: size * 0.32,
        borderLeftWidth: size * 0.55,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: color,
      }}
    />
  );
}

// Board: a framed canvas with a diagonal pencil stroke, for the drawing/visualization surface.
export function BoardIcon({ color, size = 22 }: IconProps) {
  return (
    <View style={{ width: size, height: size, borderWidth: 2, borderColor: color, borderRadius: size * 0.2, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: size * 0.7,
          height: 2,
          backgroundColor: color,
          borderRadius: 1,
          transform: [{ rotate: '-45deg' }],
        }}
      />
    </View>
  );
}

// Spark: marks anything the AI chose or learned.
export function SparkIcon({ color, size = 14 }: IconProps) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: size * 0.62,
          height: size * 0.62,
          borderRadius: size * 0.08,
          backgroundColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}
