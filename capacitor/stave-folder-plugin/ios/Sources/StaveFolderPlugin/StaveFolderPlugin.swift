import Foundation
import Capacitor
import UniformTypeIdentifiers
import UIKit

/// Filesystem home for Stave notes.
/// Default root: the app's own Documents directory (visible in the Files app).
/// Optional root: any folder the user picks (e.g. iCloud Drive/Stave), held
/// across launches via a security-scoped bookmark, so iPad and Mac write the
/// same notebook.
@objc(StaveFolderPlugin)
public class StaveFolderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StaveFolderPlugin"
    public let jsName = "StaveFolder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "snapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickFolder", returnType: CAPPluginReturnPromise)
    ]

    private let bookmarkKey = "stave-folder-bookmark"
    private let noteDirs = ["write", "plan", "longform", "projects"]
    private var pickerDelegate: FolderPickerDelegate?
    private var cachedRoot: URL?
    private var cachedScoped = false

    // MARK: root resolution

    private func root() -> (url: URL, mode: String) {
        if let cached = cachedRoot {
            return (cached, cachedScoped ? "folder" : "local")
        }
        if let data = UserDefaults.standard.data(forKey: bookmarkKey) {
            var stale = false
            if let url = try? URL(resolvingBookmarkData: data, bookmarkDataIsStale: &stale),
               url.startAccessingSecurityScopedResource() {
                if stale, let fresh = try? url.bookmarkData() {
                    UserDefaults.standard.set(fresh, forKey: bookmarkKey)
                }
                cachedRoot = url
                cachedScoped = true
                return (url, "folder")
            }
            // Stale/broken bookmark: fall back to local rather than failing.
            UserDefaults.standard.removeObject(forKey: bookmarkKey)
        }
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        cachedRoot = docs
        cachedScoped = false
        return (docs, "local")
    }

    private func fileURL(_ rel: String) throws -> URL {
        let clean = rel.split(separator: "/").filter { $0 != ".." && $0 != "." }.joined(separator: "/")
        guard !clean.isEmpty else { throw NSError(domain: "Stave", code: 1, userInfo: [NSLocalizedDescriptionKey: "empty path"]) }
        return root().url.appendingPathComponent(clean)
    }

    // MARK: snapshot

    @objc func snapshot(_ call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            let (rootURL, mode) = self.root()
            let fm = FileManager.default
            var files: [[String: Any]] = []

            for dir in self.noteDirs {
                let dirURL = rootURL.appendingPathComponent(dir)
                try? fm.createDirectory(at: dirURL, withIntermediateDirectories: true)
                let entries = (try? fm.contentsOfDirectory(at: dirURL, includingPropertiesForKeys: [.contentModificationDateKey], options: [.skipsHiddenFiles])) ?? []
                for entry in entries where entry.pathExtension == "md" {
                    if let f = self.readEntry(entry, rel: "\(dir)/\(entry.lastPathComponent)") {
                        files.append(f)
                    }
                }
            }
            let prefs = rootURL.appendingPathComponent("prefs.json")
            if let f = self.readEntry(prefs, rel: "prefs.json") {
                files.append(f)
            }

            call.resolve([
                "mode": mode,
                "folderName": mode == "folder" ? rootURL.lastPathComponent : "",
                "files": files
            ])
        }
    }

    private func readEntry(_ url: URL, rel: String) -> [String: Any]? {
        var content = coordinatedRead(url)
        if content == nil {
            // Possibly an un-downloaded iCloud item: nudge and retry once.
            try? FileManager.default.startDownloadingUbiquitousItem(at: url)
            Thread.sleep(forTimeInterval: 0.6)
            content = coordinatedRead(url)
        }
        guard let text = content else { return nil }
        let mtime = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate)
            .map { $0.timeIntervalSince1970 * 1000 } ?? 0
        return ["path": rel, "content": text, "mtime": mtime]
    }

    private func coordinatedRead(_ url: URL) -> String? {
        var result: String?
        var coordErr: NSError?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordErr) { readURL in
            result = try? String(contentsOf: readURL, encoding: .utf8)
        }
        return result
    }

    // MARK: write / delete

    @objc func writeFile(_ call: CAPPluginCall) {
        guard let rel = call.getString("path"), let data = call.getString("data") else {
            call.reject("path and data required")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let url = try self.fileURL(rel)
                var coordErr: NSError?
                var writeErr: Error?
                NSFileCoordinator().coordinate(writingItemAt: url, options: .forReplacing, error: &coordErr) { writeURL in
                    do {
                        try FileManager.default.createDirectory(at: writeURL.deletingLastPathComponent(), withIntermediateDirectories: true)
                        try data.write(to: writeURL, atomically: true, encoding: .utf8)
                    } catch { writeErr = error }
                }
                if let e = coordErr ?? (writeErr as NSError?) {
                    call.reject("write failed: \(e.localizedDescription)")
                } else {
                    call.resolve()
                }
            } catch {
                call.reject("bad path: \(rel)")
            }
        }
    }

    @objc func deleteFile(_ call: CAPPluginCall) {
        guard let rel = call.getString("path") else {
            call.reject("path required")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let url = try self.fileURL(rel)
                var coordErr: NSError?
                NSFileCoordinator().coordinate(writingItemAt: url, options: .forDeleting, error: &coordErr) { delURL in
                    try? FileManager.default.removeItem(at: delURL)
                }
                call.resolve()
            } catch {
                call.reject("bad path: \(rel)")
            }
        }
    }

    // MARK: folder picking

    @objc func pickFolder(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController else {
                call.reject("no view controller")
                return
            }
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.folder])
            picker.allowsMultipleSelection = false
            let delegate = FolderPickerDelegate { url in
                defer { self.pickerDelegate = nil }
                guard let url = url else {
                    let (_, mode) = self.root()
                    call.resolve(["mode": mode, "folderName": mode == "folder" ? self.root().url.lastPathComponent : ""])
                    return
                }
                guard url.startAccessingSecurityScopedResource() else {
                    call.reject("could not access folder")
                    return
                }
                do {
                    let bookmark = try url.bookmarkData()
                    UserDefaults.standard.set(bookmark, forKey: self.bookmarkKey)
                    self.cachedRoot = url
                    self.cachedScoped = true
                    call.resolve(["mode": "folder", "folderName": url.lastPathComponent])
                } catch {
                    call.reject("bookmark failed: \(error.localizedDescription)")
                }
            }
            self.pickerDelegate = delegate
            picker.delegate = delegate
            vc.present(picker, animated: true)
        }
    }
}

private class FolderPickerDelegate: NSObject, UIDocumentPickerDelegate {
    private let completion: (URL?) -> Void
    init(completion: @escaping (URL?) -> Void) { self.completion = completion }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        completion(urls.first)
    }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        completion(nil)
    }
}
