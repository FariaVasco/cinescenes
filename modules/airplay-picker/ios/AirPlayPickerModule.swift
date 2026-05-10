import AVFoundation
import ExpoModulesCore
import AVKit

public class AirPlayPickerModule: Module {
  private let routeDetector = AVRouteDetector()
  private var observer: NSObjectProtocol?

  // True only when a video-mirroring-capable route (AirPlay TV, Apple TV) is
  // detected. On iOS 16+ we can inspect detectedRoutes directly; older versions
  // fall back to the coarser multipleRoutesDetected flag.
  private var hasVideoMirroringRoute: Bool {
    if #available(iOS 16.0, *) {
      let routes = routeDetector.detectedRoutes
      print("🎬 detectedRoutes (\(routes.count)):")
      for r in routes {
        print("  · \(r.routeName) — supportsVideoMirroring=\(r.supportsVideoMirroring)")
      }
      return routes.contains { $0.supportsVideoMirroring }
    }
    return routeDetector.multipleRoutesDetected
  }

  public func definition() -> ModuleDefinition {
    Name("AirPlayPicker")

    Events("onRoutesAvailableChanged")

    OnCreate {
      let session = AVAudioSession.sharedInstance()
      try? session.setCategory(.playback, mode: .moviePlayback, policy: .longFormVideo, options: [])
      try? session.setActive(true)
      self.routeDetector.isRouteDetectionEnabled = true
      self.observer = NotificationCenter.default.addObserver(
        forName: NSNotification.Name("AVRouteDetectorMultipleRoutesDetectedDidChange"),
        object: self.routeDetector,
        queue: .main
      ) { [weak self] _ in
        guard let self = self else { return }
        self.sendEvent("onRoutesAvailableChanged", [
          "available": self.hasVideoMirroringRoute
        ])
      }
    }

    OnDestroy {
      if let obs = self.observer {
        NotificationCenter.default.removeObserver(obs)
      }
      self.routeDetector.isRouteDetectionEnabled = false
    }

    Function("isMultipleRoutesAvailable") { () -> Bool in
      return self.hasVideoMirroringRoute
    }

    View(AirPlayPickerView.self) {
      Prop("tintColor") { (view: AirPlayPickerView, value: String?) in
        if let hex = value, let color = UIColor(hex: hex) {
          view.routePickerView.tintColor = color
        }
      }
      Prop("activeTintColor") { (view: AirPlayPickerView, value: String?) in
        if let hex = value, let color = UIColor(hex: hex) {
          view.routePickerView.activeTintColor = color
        }
      }
    }
  }
}

class AirPlayPickerView: ExpoView, AVRoutePickerViewDelegate {
  let routePickerView = AVRoutePickerView()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    routePickerView.tintColor = .white
    routePickerView.activeTintColor = UIColor(red: 0.96, green: 0.77, blue: 0.09, alpha: 1)
    routePickerView.prioritizesVideoDevices = true
    routePickerView.delegate = self
    addSubview(routePickerView)
    print("🎬 AirPlayPickerView init — delegate=\(routePickerView.delegate != nil)")
  }

  func routePickerViewWillBeginPresentingRoutes(_ routePickerView: AVRoutePickerView) {
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.playback, mode: .moviePlayback, policy: .longFormVideo, options: [])
    try? session.setActive(true)
    print("🎬 picker OPENING — category=\(session.category.rawValue) policy=\(session.routeSharingPolicy.rawValue)")
  }

  func routePickerViewDidEndPresentingRoutes(_ routePickerView: AVRoutePickerView) {
    let session = AVAudioSession.sharedInstance()
    let outputs = session.currentRoute.outputs
      .map { "\($0.portName) [\($0.portType.rawValue)]" }
      .joined(separator: ", ")
    print("🎬 picker CLOSED — outputs: \(outputs.isEmpty ? "none" : outputs) — screens=\(UIScreen.screens.count)")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    routePickerView.frame = bounds
  }
}

// Minimal hex → UIColor helper
extension UIColor {
  convenience init?(hex: String) {
    let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    var int: UInt64 = 0
    guard Scanner(string: hex).scanHexInt64(&int), hex.count == 6 else { return nil }
    let r = CGFloat((int >> 16) & 0xFF) / 255
    let g = CGFloat((int >> 8) & 0xFF) / 255
    let b = CGFloat(int & 0xFF) / 255
    self.init(red: r, green: g, blue: b, alpha: 1)
  }
}
