mod args;
mod collection;
mod run;
mod test;

use std::sync::Arc;

use clap::Parser;

use args::{Cli, Command};
use probe_core::{
    CollectionRepository, CsvLoader, CsvRowLoader, Engine, FileCollectionRepository,
    HttpExecutor, LoadTestRunner, Runner,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    // Composition root: implementaciones concretas inyectadas como puertos.
    let engine: Arc<dyn HttpExecutor> = Arc::new(Engine::new()?);
    let csv: Arc<dyn CsvRowLoader> = Arc::new(CsvLoader);
    let runner: Arc<dyn LoadTestRunner> = Arc::new(Runner::new(engine.clone(), csv));
    let file_repo = Arc::new(FileCollectionRepository::new()?);
    let repo: Arc<dyn CollectionRepository> = file_repo.clone();

    match cli.command {
        Command::Run(args) => run::run(args, repo.clone(), engine.clone()).await,
        Command::Collection(args) => collection::collection(args.command, &file_repo),
        Command::Test(args) => test::test(args, repo.clone(), runner.clone()).await,
    }
}
