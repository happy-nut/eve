fn main() {
  if let Some(code) = eve_lib::cli::main(std::env::args().skip(1).collect()) {
    std::process::exit(code);
  }
  eve_lib::run();
}
