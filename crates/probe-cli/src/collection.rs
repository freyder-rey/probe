use probe_core::{Collection, CollectionRepository, FileCollectionRepository};

use crate::args::CollectionCommand;

pub fn collection(
    command: CollectionCommand,
    storage: &FileCollectionRepository,
) -> anyhow::Result<()> {
    match command {
        CollectionCommand::List => {
            let collections = storage.list()?;
            if collections.is_empty() {
                println!(
                    "No hay colecciones guardadas en {}",
                    storage.dir().display()
                );
                return Ok(());
            }
            println!("Colecciones en {}:", storage.dir().display());
            for c in collections {
                println!("  {}  ({} bytes)", c.name, c.size);
            }
        }
        CollectionCommand::Save { path } => {
            let collection = storage.load_file(&path)?;
            let saved = storage.save_path(&collection)?;
            println!(
                "Colección \"{}\" guardada en {}",
                collection.name,
                saved.display()
            );
        }
        CollectionCommand::New { name } => {
            let collection = Collection {
                name,
                version: "1".to_string(),
                requests: vec![],
                tests: vec![],
            };
            let saved = storage.save_path(&collection)?;
            println!("Colección vacía creada en {}", saved.display());
        }
        CollectionCommand::Delete { name } => {
            storage.delete(&name)?;
            println!("Colección \"{name}\" eliminada.");
        }
    }
    Ok(())
}
