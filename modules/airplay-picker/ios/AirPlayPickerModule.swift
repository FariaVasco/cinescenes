import ExpoModulesCore
import AVKit

public class AirPlayPickerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AirPlayPicker")

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

class AirPlayPickerView: ExpoView {
  let routePickerView = AVRoutePickerView()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    routePickerView.tintColor = .white
    routePickerView.activeTintColor = UIColor(red: 0.96, green: 0.77, blue: 0.09, alpha: 1)
    addSubview(routePickerView)
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
