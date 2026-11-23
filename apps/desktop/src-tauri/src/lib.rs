mod audit_log;
mod custom_provider;
mod default_model;
mod exec_policy;
mod gateway;
mod onboarding;
mod openclaw_auth;
mod pet_memory;
mod policy_file;
mod provider_catalog;
mod provider_models;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(gateway::GatewayState::default())
        .invoke_handler(tauri::generate_handler![
            gateway::gateway_info,
            gateway::gateway_connect,
            gateway::gateway_request,
            gateway::gateway_disconnect,
            pet_memory::pet_memory_load,
            pet_memory::pet_memory_save,
            pet_memory::pet_memory_clear,
            onboarding::openclaw_status,
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