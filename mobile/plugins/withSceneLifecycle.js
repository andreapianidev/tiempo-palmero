/**
 * Adopción del ciclo de vida `UIScene`.
 *
 * Desde el SDK de iOS 26, una app que no lo adopta ya no recibe un aviso: UIKit
 * la mata al arrancar, con un `EXC_BREAKPOINT` en
 * `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` antes de que
 * llegue a ejecutarse una sola línea de JavaScript. Expo SDK 57 todavía genera
 * el `AppDelegate` clásico —crea la `UIWindow` en `didFinishLaunching` y no
 * declara ninguna escena— así que sin esto la app no abre en un simulador de
 * iOS 26 o 27.
 *
 * Esto es un plugin y no una edición a mano de `ios/` a propósito: ese
 * directorio no está en el repositorio y lo regenera `expo prebuild`, así que
 * un parche a mano dura hasta la siguiente regeneración y desaparece sin avisar.
 *
 * Cuando Expo adopte escenas en su propia plantilla, este fichero se borra y no
 * queda rastro: no toca nada más.
 */

const { withInfoPlist, withDangerousMod, withXcodeProject, IOSConfig } = require('expo/config-plugins')
const fs = require('fs')
const path = require('path')

const FILE = 'SceneDelegate.swift'

/**
 * La escena no monta React Native: eso lo sigue haciendo el `AppDelegate`, que
 * corre antes. Aquí solo se adopta la ventana que ya existe y se le asigna la
 * escena, que es lo único que faltaba. Así el arranque de Expo queda intacto.
 */
const SOURCE = `// Generado por plugins/withSceneLifecycle.js — no editar a mano.
import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }

    // El AppDelegate ya ha creado la ventana con la vista raíz de React Native
    // dentro. Solo hay que conectarla a la escena; crear otra dejaría la app en
    // negro con el árbol de React montado en una ventana que nadie enseña.
    let existing = (UIApplication.shared.delegate as? AppDelegate)?.window
    let window = existing ?? UIWindow(windowScene: windowScene)
    window.windowScene = windowScene
    window.makeKeyAndVisible()
    self.window = window
  }
}
`

/** Ficha de escena mínima que UIKit acepta como adopción de verdad. */
function sceneManifest() {
  return {
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [
        {
          UISceneConfigurationName: 'Default Configuration',
          UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
        },
      ],
    },
  }
}

module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = sceneManifest()
    return cfg
  })

  config = withDangerousMod(config, [
    'ios',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, cfg.modRequest.projectName)
      fs.writeFileSync(path.join(dir, FILE), SOURCE, 'utf8')
      return cfg
    },
  ])

  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults
    const group = cfg.modRequest.projectName
    const filepath = `${group}/${FILE}`
    // `expo prebuild` sin `--clean` vuelve a pasar por aquí sobre un proyecto
    // que ya tiene el fichero; añadirlo dos veces rompe la compilación.
    if (!project.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: group,
        project,
      })
    }
    return cfg
  })

  return config
}
