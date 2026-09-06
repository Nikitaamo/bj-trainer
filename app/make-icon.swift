// Renders the app icon (1024x1024 PNG): felt-green rounded square, gold rim,
// white spade and a gold "21".
// Usage: make-icon <out.png> [--square]
//   --square paints the felt over the whole canvas with no transparent
//   corners (for iOS home-screen icons, which get rounded by the system).
import AppKit

let args = CommandLine.arguments.dropFirst()
let out = args.first(where: { !$0.hasPrefix("--") }) ?? "icon.png"
let square = args.contains("--square")
let px = 1024
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                           colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
rep.size = NSSize(width: px, height: px)

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

let size = CGFloat(px)
let rect = NSRect(x: 0, y: 0, width: size, height: size)

// felt
let shape = square ? NSBezierPath(rect: rect)
                   : NSBezierPath(roundedRect: rect.insetBy(dx: 52, dy: 52), xRadius: 215, yRadius: 215)
let felt = NSGradient(colors: [NSColor(red: 0.16, green: 0.50, blue: 0.35, alpha: 1),
                               NSColor(red: 0.08, green: 0.29, blue: 0.20, alpha: 1)])!
felt.draw(in: shape, relativeCenterPosition: NSPoint(x: 0, y: 0.35))

// gold rim
let rimInset: CGFloat = square ? 70 : 92
let rim = NSBezierPath(roundedRect: rect.insetBy(dx: rimInset, dy: rimInset), xRadius: 180, yRadius: 180)
NSColor(red: 0.86, green: 0.69, blue: 0.30, alpha: 1).setStroke()
rim.lineWidth = 16
rim.stroke()

// spade
let para = NSMutableParagraphStyle()
para.alignment = .center
let spadeAttrs: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 520, weight: .bold),
    .foregroundColor: NSColor(white: 0.98, alpha: 1),
    .paragraphStyle: para,
]
let shadow = NSShadow()
shadow.shadowColor = NSColor(white: 0, alpha: 0.35)
shadow.shadowOffset = NSSize(width: 0, height: -10)
shadow.shadowBlurRadius = 24
shadow.set()
("♠" as NSString).draw(in: NSRect(x: 0, y: 300, width: size, height: 600), withAttributes: spadeAttrs)

// "21"
let numFont = NSFont(name: "Didot-Bold", size: 250) ?? NSFont.boldSystemFont(ofSize: 250)
let numAttrs: [NSAttributedString.Key: Any] = [
    .font: numFont,
    .foregroundColor: NSColor(red: 0.93, green: 0.78, blue: 0.40, alpha: 1),
    .paragraphStyle: para,
]
("21" as NSString).draw(in: NSRect(x: 0, y: 95, width: size, height: 300), withAttributes: numAttrs)

NSGraphicsContext.restoreGraphicsState()

let png = rep.representation(using: .png, properties: [:])!
try! png.write(to: URL(fileURLWithPath: out))
print("wrote \(out)")
