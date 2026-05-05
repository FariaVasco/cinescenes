import ExpoModulesCore

private let kGameIdKey = "com.cinescenes.tvGameId"

public class TVSessionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TVSession")

    Function("setGameId") { (gameId: String) in
      UserDefaults.standard.set(gameId, forKey: kGameIdKey)
    }

    Function("getGameId") { () -> String? in
      return UserDefaults.standard.string(forKey: kGameIdKey)
    }
  }
}
