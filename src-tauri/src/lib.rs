mod core_supervisor;

use core_supervisor::CoreSupervisor;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(CoreSupervisor::new())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window.state::<CoreSupervisor>().shutdown();
            }
        })
        .invoke_handler(tauri::generate_handler![
            core_supervisor::runtime_info,
            core_supervisor::probe_core,
            core_supervisor::start_core,
            core_supervisor::stop_core,
            core_supervisor::core_status,
            core_supervisor::core_logs,
            core_supervisor::save_profile,
            core_supervisor::load_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running WhiteAesther");
}
