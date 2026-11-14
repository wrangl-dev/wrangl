//! Check for Updates. This build has no updater (the host app ships the canvas and updates it), so
//! a check only says that checks are unsupported, as the web build always has.

use crate::FigApp;
use crate::i18n::tr;

#[derive(Default)]
pub(crate) struct Runtime {
    /// The result dialog of a manual check is open.
    pub(crate) manual_window_open: bool,
    /// The only result: checks are unsupported.
    pub(crate) status_message: Option<String>,
}

impl FigApp {
    /// Kept for callers of the desktop API; there is no check at start to turn on.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn set_startup_update_check(&mut self, on: bool) {
        let _ = on;
    }
}

pub(crate) fn check(app: &mut FigApp) {
    app.updates_rt.manual_window_open = true;
    app.updates_rt.status_message = Some(tr("Update check is not supported in the web browser.").to_string());
}

pub(crate) fn tick(app: &mut FigApp, ctx: &egui::Context) {
    let _ = (app, ctx);
}

pub(crate) fn show(app: &mut FigApp, ctx: &egui::Context) {
    if app.updates_rt.manual_window_open {
        let mut open = true;
        let mut close = false;
        egui::Window::new(tr("Check for Updates"))
            .open(&mut open)
            .resizable(false)
            .collapsible(false)
            .anchor(egui::Align2::CENTER_CENTER, egui::vec2(0.0, 0.0))
            .show(ctx, |ui| {
                if let Some(msg) = &app.updates_rt.status_message {
                    ui.label(msg);
                }
                ui.add_space(8.0);
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.button(tr("Close")).clicked() {
                        close = true;
                    }
                });
            });
        if !open || close {
            app.updates_rt.manual_window_open = false;
            app.updates_rt.status_message = None;
        }
    }
}
