use std::{
    collections::HashMap,
    sync::{atomic::AtomicBool, Arc, Mutex},
};

use probe_core::LoadTestReport;

#[derive(Clone, Default)]
pub struct AppState {
    pub runs: Arc<Mutex<HashMap<String, RunState>>>,
}

#[derive(Clone)]
pub struct RunState {
    pub status: String,
    pub done: u64,
    pub total: u64,
    pub cancel: Arc<AtomicBool>,
    pub report: Option<LoadTestReport>,
    pub error: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStatusResponse {
    pub status: String,
    pub done: u64,
    pub total: u64,
    pub report: Option<LoadTestReport>,
    pub error: Option<String>,
}

impl RunStatusResponse {
    pub fn from_run(run: &RunState) -> Self {
        RunStatusResponse {
            status: run.status.clone(),
            done: run.done,
            total: run.total,
            report: run.report.clone(),
            error: run.error.clone(),
        }
    }
}
