use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use probe_core::{Collection, LoadTestReport, Runner, Storage};

use crate::args::{TestArgs, TestCommand};

pub async fn test(args: TestArgs) -> anyhow::Result<()> {
    match args.command {
        TestCommand::List { collection } => list(&collection),
        TestCommand::Run { collection, test, iterations, delay } => {
            run(&collection, &test, iterations, delay).await
        }
    }
}

fn load_collection(target: &str) -> anyhow::Result<Collection> {
    let storage = Storage::new()?;
    if target.ends_with(".json") {
        storage.load_file(&PathBuf::from(target))
    } else {
        storage.load(target)
    }
}

fn list(target: &str) -> anyhow::Result<()> {
    let collection = load_collection(target)?;
    if collection.tests.is_empty() {
        println!("La colección \"{}\" no tiene tests definidos.", collection.name);
        return Ok(());
    }
    println!("Tests de \"{}\":", collection.name);
    for t in &collection.tests {
        let scope = if t.request_names.is_empty() {
            "todas las solicitudes".to_string()
        } else {
            t.request_names.join(", ")
        };
        let csv = if t.csv.is_some() { " | con CSV" } else { "" };
        println!(
            "  {} — {} iteración(es), delay {} ms, {} {csv}",
            t.name, t.iterations, t.delay_ms, scope
        );
    }
    Ok(())
}

async fn run(
    target: &str,
    name: &str,
    iterations: Option<u64>,
    delay: Option<u64>,
) -> anyhow::Result<()> {
    let collection = load_collection(target)?;
    let mut test = collection
        .tests
        .iter()
        .find(|t| t.name == name)
        .ok_or_else(|| anyhow::anyhow!("test \"{name}\" no encontrado en \"{}\"", collection.name))?
        .clone();
    if let Some(i) = iterations {
        test.iterations = i;
    }
    if let Some(d) = delay {
        test.delay_ms = d;
    }

    let cancel = Arc::new(AtomicBool::new(false));
    {
        let cancel = cancel.clone();
        tokio::spawn(async move {
            if tokio::signal::ctrl_c().await.is_ok() {
                cancel.store(true, Ordering::Relaxed);
            }
        });
    }

    println!("Ejecutando test \"{}\" (Ctrl+C para detener)...", test.name);
    let runner = Runner::new()?;
    let report = runner
        .run(&test, &collection.requests, Some(&cancel), |done, total| {
            if total == 0 || done == total || done % 25 == 0 {
                println!("  {done} de {total} solicitudes");
            }
        })
        .await?;

    print_report(&report);
    Ok(())
}

fn print_report(report: &LoadTestReport) {
    let resultado = if report.failed == 0 { "PASÓ" } else { "FALLÓ" };
    println!();
    println!("== Reporte del test \"{}\" ({resultado}) ==", report.test_name);
    println!("  Duración: {} ms", report.duration_ms);
    println!(
        "  Solicitudes: {} total, {} OK, {} fallidas",
        report.total_requests, report.success, report.failed
    );
    println!(
        "  Tiempo por solicitud: promedio {} ms, p95 {} ms",
        report.avg_ms, report.p95_ms
    );
    if !report.per_request.is_empty() {
        println!();
        println!("  Por solicitud:");
        for s in &report.per_request {
            println!(
                "    {} — {} total, {} OK, {} fallidas",
                s.name, s.total, s.success, s.failed
            );
        }
    }
    if !report.errors.is_empty() {
        println!();
        println!("  Errores:");
        for e in &report.errors {
            println!("    - {e}");
        }
    }
}
