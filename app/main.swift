// Minimal native macOS shell for European Black Jack.
// Serves the bundled HTML through a custom URL scheme (bjapp://) so that
// localStorage works and the page has a stable origin. External http(s)
// links open in the default browser; the strategy table opens in a second
// window. Menu labels follow the system language (Lithuanian or English).
import Cocoa
import WebKit

let isLithuanian = (Locale.preferredLanguages.first ?? "en").lowercased().hasPrefix("lt")
func tr(_ lt: String, _ en: String) -> String { isLithuanian ? lt : en }

final class SchemeHandler: NSObject, WKURLSchemeHandler {
    let root: URL
    init(root: URL) { self.root = root; super.init() }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/zaidimas.html" }
        let file = root.appendingPathComponent(String(path.dropFirst()))
        guard let data = FileManager.default.contents(atPath: file.path) else {
            let resp = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "text/plain; charset=utf-8"])!
            task.didReceive(resp)
            task.didReceive("Not found: \(path)".data(using: .utf8)!)
            task.didFinish()
            return
        }
        let mime: String
        switch file.pathExtension.lowercased() {
        case "html": mime = "text/html; charset=utf-8"
        case "js": mime = "text/javascript; charset=utf-8"
        case "css": mime = "text/css; charset=utf-8"
        case "json": mime = "application/json"
        case "png": mime = "image/png"
        case "svg": mime = "image/svg+xml"
        default: mime = "application/octet-stream"
        }
        let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                   headerFields: ["Content-Type": mime, "Content-Length": String(data.count)])!
        task.didReceive(resp)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var windows: [NSWindow] = []
    let handler = SchemeHandler(root: Bundle.main.resourceURL!)

    func applicationDidFinishLaunching(_ note: Notification) {
        buildMenu()
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(handler, forURLScheme: "bjapp")
        let webView = makeWebView(config)
        openWindow(webView, title: "European Black Jack", autosave: "main",
                   size: NSSize(width: 1120, height: 860))
        webView.load(URLRequest(url: URL(string: "bjapp://app/zaidimas.html")!))
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func makeWebView(_ config: WKWebViewConfiguration) -> WKWebView {
        let wv = WKWebView(frame: NSRect(x: 0, y: 0, width: 1120, height: 860), configuration: config)
        wv.navigationDelegate = self
        wv.uiDelegate = self
        return wv
    }

    func openWindow(_ webView: WKWebView, title: String, autosave: String, size: NSSize) {
        let w = NSWindow(contentRect: NSRect(origin: .zero, size: size),
                         styleMask: [.titled, .closable, .miniaturizable, .resizable],
                         backing: .buffered, defer: false)
        w.title = title
        w.minSize = NSSize(width: 700, height: 560)
        w.contentView = webView
        w.isReleasedWhenClosed = false
        w.center()
        w.setFrameAutosaveName(autosave)
        w.makeKeyAndOrderFront(nil)
        windows.append(w)
    }

    // http(s) links go to the default browser, everything else stays inside
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url, let scheme = url.scheme?.lowercased(),
           scheme == "http" || scheme == "https" {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    // target="_blank": bundled pages open in a new window, external ones in the browser
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = navigationAction.request.url else { return nil }
        if url.scheme?.lowercased() == "bjapp" {
            let wv = makeWebView(configuration)
            openWindow(wv, title: tr("Strategijos lentelė", "Strategy table"), autosave: "table",
                       size: NSSize(width: 1080, height: 860))
            return wv
        }
        NSWorkspace.shared.open(url)
        return nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.evaluateJavaScript("document.title") { result, _ in
            if let t = result as? String, !t.isEmpty, let w = webView.window { w.title = t }
        }
    }

    @objc func reloadPage(_ sender: Any?) {
        (NSApp.keyWindow?.contentView as? WKWebView)?.reload()
    }

    func buildMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        main.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: tr("Apie European Black Jack", "About European Black Jack"),
                        action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: tr("Slėpti", "Hide"), action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: tr("Baigti", "Quit"), action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        let editItem = NSMenuItem()
        main.addItem(editItem)
        let edit = NSMenu(title: tr("Redaguoti", "Edit"))
        edit.addItem(withTitle: tr("Iškirpti", "Cut"), action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: tr("Kopijuoti", "Copy"), action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: tr("Įklijuoti", "Paste"), action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: tr("Pažymėti viską", "Select All"), action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit

        let viewItem = NSMenuItem()
        main.addItem(viewItem)
        let view = NSMenu(title: tr("Rodinys", "View"))
        view.addItem(withTitle: tr("Perkrauti", "Reload"), action: #selector(AppDelegate.reloadPage(_:)), keyEquivalent: "r")
        viewItem.submenu = view

        let winItem = NSMenuItem()
        main.addItem(winItem)
        let win = NSMenu(title: tr("Langas", "Window"))
        win.addItem(withTitle: tr("Sumažinti", "Minimize"), action: #selector(NSWindow.miniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: tr("Uždaryti", "Close"), action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        winItem.submenu = win

        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
