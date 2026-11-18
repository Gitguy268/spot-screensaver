// Spot Screensaver for macOS: a ScreenSaverView that shows the same self-contained index.html as
// the browser version in a WKWebView, with ?saver=1 and the options from the Options sheet.
// Written in Objective-C so the bundle carries no Swift runtime into legacyScreenSaver.
#import <ScreenSaver/ScreenSaver.h>
#import <WebKit/WebKit.h>

static NSString *const kModule = @"com.gitguy268.spotscreensaver";

@interface SpotSaverView : ScreenSaverView <WKNavigationDelegate>
@property (nonatomic, strong) WKWebView *web;
@property (nonatomic, strong) NSWindow *sheet;
@property (nonatomic, strong) NSPopUpButton *stylePopup, *qualityPopup;
@property (nonatomic, strong) NSButton *soundBox;
@end

@implementation SpotSaverView

+ (ScreenSaverDefaults *)defaults {
  ScreenSaverDefaults *d = [ScreenSaverDefaults defaultsForModuleWithName:kModule];
  [d registerDefaults:@{ @"style": @"3d", @"quality": @"medium", @"sound": @NO }];
  return d;
}

- (instancetype)initWithFrame:(NSRect)frame isPreview:(BOOL)isPreview {
  self = [super initWithFrame:frame isPreview:isPreview];
  if (!self) return nil;
  self.animationTimeInterval = 1.0 / 30.0;
  self.wantsLayer = YES;
  self.layer.backgroundColor = NSColor.blackColor.CGColor;
  // legacyScreenSaver keeps instances alive after the saver stops; stop the page (and on a real
  // run, the host) when the system says the screen saver is going away.
  [NSDistributedNotificationCenter.defaultCenter addObserver:self selector:@selector(willStop:) name:@"com.apple.screensaver.willstop" object:nil];
  return self;
}

- (void)dealloc {
  [NSDistributedNotificationCenter.defaultCenter removeObserver:self];
}

- (NSURL *)pageURL {
  NSBundle *bundle = [NSBundle bundleForClass:self.class];
  NSURL *file = [bundle URLForResource:@"index" withExtension:@"html" subdirectory:@"web"];
  if (!file) return nil;
  ScreenSaverDefaults *d = [SpotSaverView defaults];
  NSURLComponents *c = [NSURLComponents componentsWithURL:file resolvingAgainstBaseURL:NO];
  c.queryItems = @[
    [NSURLQueryItem queryItemWithName:@"saver" value:@"1"],
    [NSURLQueryItem queryItemWithName:@"style" value:[d stringForKey:@"style"]],
    [NSURLQueryItem queryItemWithName:@"quality" value:self.isPreview ? @"low" : [d stringForKey:@"quality"]],
    [NSURLQueryItem queryItemWithName:@"preview" value:self.isPreview ? @"1" : @"0"],
    [NSURLQueryItem queryItemWithName:@"sound" value:(!self.isPreview && [d boolForKey:@"sound"]) ? @"1" : @"0"],
    [NSURLQueryItem queryItemWithName:@"fps" value:self.isPreview ? @"15" : @"30"],
  ];
  return c.URL;
}

- (void)startWeb {
  if (self.web) return;
  WKWebViewConfiguration *config = [WKWebViewConfiguration new];
  config.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone;
  config.suppressesIncrementalRendering = YES;
  WKWebView *web = [[WKWebView alloc] initWithFrame:self.bounds configuration:config];
  web.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  [web setValue:@NO forKey:@"drawsBackground"]; // no white flash while the page loads
  web.navigationDelegate = self;
  self.web = web;
  [self addSubview:web];
  NSURL *url = [self pageURL];
  if (url) [web loadFileURL:url allowingReadAccessToURL:url.URLByDeletingLastPathComponent];
}

- (void)stopWeb {
  if (!self.web) return;
  [self.web evaluateJavaScript:@"window.__spotSaver && window.__spotSaver.stop()" completionHandler:nil];
  [self.web stopLoading];
  [self.web removeFromSuperview];
  self.web = nil;
}

- (void)startAnimation {
  [super startAnimation];
  [self startWeb];
}

- (void)stopAnimation {
  [super stopAnimation];
  [self stopWeb];
}

- (void)willStop:(NSNotification *)note {
  [self stopWeb];
  // On macOS 14+ the host process lingers and keeps old instances running; quit it on a real run.
  if (!self.isPreview) dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{ exit(0); });
}

- (void)animateOneFrame {
  // the page draws itself; nothing to do here
}

- (void)drawRect:(NSRect)rect {
  [NSColor.blackColor setFill];
  NSRectFill(rect);
}

// ---------------------------------------------------------------- Options sheet

- (BOOL)hasConfigureSheet { return YES; }

- (NSWindow *)configureSheet {
  if (self.sheet) { [self loadOptions]; return self.sheet; }
  NSWindow *w = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 360, 200) styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];
  NSView *v = w.contentView;
  NSTextField *(^label)(NSString *, CGFloat) = ^NSTextField *(NSString *s, CGFloat y) {
    NSTextField *t = [NSTextField labelWithString:s];
    t.frame = NSMakeRect(20, y, 90, 22);
    t.alignment = NSTextAlignmentRight;
    [v addSubview:t];
    return t;
  };
  NSTextField *title = [NSTextField labelWithString:@"Spot naps, dreams and chases."];
  title.frame = NSMakeRect(20, 160, 320, 22);
  title.font = [NSFont boldSystemFontOfSize:13];
  [v addSubview:title];
  label(@"Style:", 122);
  self.stylePopup = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(116, 118, 220, 26) pullsDown:NO];
  [self.stylePopup addItemsWithTitles:@[@"3D", @"Vector", @"Both, taking turns"]];
  [v addSubview:self.stylePopup];
  label(@"Quality:", 88);
  self.qualityPopup = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(116, 84, 220, 26) pullsDown:NO];
  [self.qualityPopup addItemsWithTitles:@[@"Low (saves power)", @"Medium", @"High"]];
  [v addSubview:self.qualityPopup];
  self.soundBox = [NSButton checkboxWithTitle:@"Fire crackle and snoring" target:nil action:nil];
  self.soundBox.frame = NSMakeRect(116, 54, 230, 22);
  [v addSubview:self.soundBox];
  NSButton *done = [NSButton buttonWithTitle:@"Done" target:self action:@selector(closeSheet:)];
  done.frame = NSMakeRect(250, 12, 92, 32);
  done.keyEquivalent = @"\r";
  [v addSubview:done];
  NSButton *cancel = [NSButton buttonWithTitle:@"Cancel" target:self action:@selector(cancelSheet:)];
  cancel.frame = NSMakeRect(156, 12, 92, 32);
  cancel.keyEquivalent = @"\e";
  [v addSubview:cancel];
  self.sheet = w;
  [self loadOptions];
  return w;
}

- (void)loadOptions {
  ScreenSaverDefaults *d = [SpotSaverView defaults];
  NSArray *styles = @[@"3d", @"vector", @"alternate"], *levels = @[@"low", @"medium", @"high"];
  NSUInteger s = [styles indexOfObject:[d stringForKey:@"style"]], q = [levels indexOfObject:[d stringForKey:@"quality"]];
  [self.stylePopup selectItemAtIndex:s == NSNotFound ? 0 : s];
  [self.qualityPopup selectItemAtIndex:q == NSNotFound ? 1 : q];
  self.soundBox.state = [d boolForKey:@"sound"] ? NSControlStateValueOn : NSControlStateValueOff;
}

- (void)closeSheet:(id)sender {
  ScreenSaverDefaults *d = [SpotSaverView defaults];
  [d setObject:@[@"3d", @"vector", @"alternate"][self.stylePopup.indexOfSelectedItem] forKey:@"style"];
  [d setObject:@[@"low", @"medium", @"high"][self.qualityPopup.indexOfSelectedItem] forKey:@"quality"];
  [d setBool:self.soundBox.state == NSControlStateValueOn forKey:@"sound"];
  [d synchronize];
  [self endSheet];
  // reload the preview with the new options
  if (self.web) { [self stopWeb]; [self startWeb]; }
}

- (void)cancelSheet:(id)sender { [self endSheet]; }

- (void)endSheet {
  if (self.sheet.sheetParent) [self.sheet.sheetParent endSheet:self.sheet];
  else [self.sheet orderOut:nil];
}

@end
