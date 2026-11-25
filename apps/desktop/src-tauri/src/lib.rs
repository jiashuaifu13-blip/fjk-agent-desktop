mod audit_log;
mod custom_provider;
mod default_model;
mod env_check;
mod exec_policy;
mod gateway;
mod gateway_launch;
mod onboarding;
mod openclaw_auth;
mod openclaw_install;
mod pet_memory;
mod policy_file;
mod provider_catalog;
mod provider_models;

use tauri::Manager;


/// 单实例保护：避免重复打开导致多个窗口/多个审批订阅。
#[cfg(windows)]
fn ensure_single_instance() {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
    use windows::Win32::System::Threading::CreateMutexW;

    unsafe {
        let name: Vec<u16> = "Local\\FJK-Agent-SingleInstance\0".encode_utf16().collect();
        let handle = CreateMutexW(None, false, PCWSTR(name.as_ptr()));

        if handle.is_err() {
            return;
        }

        if GetLastError() == ERROR_ALREADY_EXISTS {
            // 已有实例在运行：直接退出，避免多窗口
            std::process::exit(0);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(windows)]
    ensure_single_instance();

    tauri::Builder::default()
        .setup(|app| {
            /*
             * 把随安装包分发的 fjkctl.exe 释放到用户目录（%APPDATA%\com.fjk.agent\bin）。
             * agent 通过 exec 调用这个固定路径；长度不同才覆盖，避免每次启动重复写盘。
             */
            if let Ok(resource) = app
                .path()
                .resolve("resources/fjkctl.exe", tauri::path::BaseDirectory::Resource)
            {
                if resource.exists() {
                    if let Ok(dir) = app.path().app_data_dir() {
                        let bin_dir = dir.join("bin");
                        let _ = std::fs::create_dir_all(&bin_dir);

                        let target = bin_dir.join("fjkctl.exe");
                        let stale = match (
                            std::fs::metadata(&target),
                            std::fs::metadata(&resource),
                        ) {
                            (Ok(existing), Ok(source)) => existing.len() != source.len(),
                            _ => true,
                        };

                        if stale {
                            let _ = std::fs::copy(&resource, &target);
                        }
                    }
                }
            }

            Ok(())
        })
        .manage(gateway::GatewayState::default())
        .manage(gateway_launch::GatewayLaunchState::default())
        .manage(std::sync::Arc::new(openclaw_install::InstallState::default()))
        .invoke_handler(tauri::generate_handler![
            gateway::gateway_info,
            gateway::gateway_connect,
            gateway::gateway_request,
            gateway::gateway_disconnect,
            gateway_launch::gateway_ensure_running,
            gateway_launch::gateway_probe,
            pet_memory::pet_memory_load,
            pet_memory::pet_memory_save,
            pet_memory::pet_memory_clear,
            onboarding::openclaw_status,
            env_check::env_check,
            env_check::open_url,
            openclaw_install::openclaw_install,
            openclaw_install::openclaw_install_status,
            openclaw_auth::openclaw_auth_list,
            openclaw_auth::openclaw_save_api_key,
            provider_models::provider_list_models,
            provider_catalog::openclaw_merge_provider_models,
            custom_provider::custom_list_models,
            custom_provider::openclaw_configure_custom_provider,
            default_model::openclaw_set_default_model,
            exec_policy::openclaw_exec_policy_status,
            exec_policy::openclaw_set_exec_mode,
            audit_log::audit_append,
            audit_log::audit_info,
            policy_file::policy_load,
            policy_file::policy_save,
            policy_file::policy_open,
            policy_file::policy_reveal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}