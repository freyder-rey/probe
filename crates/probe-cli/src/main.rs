mod args;
mod collection;
mod run;
mod test;

use clap::Parser;

use args::{Cli, Command};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Run(args) => run::run(args).await,
        Command::Collection(args) => collection::collection(args.command),
        Command::Test(args) => test::test(args).await,
    }
}
