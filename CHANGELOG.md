# Changelog

** 2.0.0

* Introduced simplified alternate interface for custom file format parsers. If a stream interface is not available you can use a simple callback interface, at the price of keeping all of the data in RAM during the import, which for many file formats (notably Excel) is acceptable. A convenience wrapper automatically invokes these simplified parsers without the need to change the rest of the import logic.
* Added simple Excel import. The first worksheet in the file is imported. The standard string-based validators are applied to each field, much as if it were a CSV file.
* Fixed a crashing bug in the TSV reader due to a typo.
* Correctly refreshes the "manage" modal display when finished.
* Minor cleanup.
* Declared stable and bumped to 2.x to start out matching Apostrophe.
