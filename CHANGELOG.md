# Changelog

** UNRELEASED

* Fix a denial-of-service vulnerability by bumping xlsx package to its latest version.

** 2.3.0

* Support to update pieces when id is number.

** 2.2.0

* Error messages are displayed in the import modal.

** 2.1.6

* Updates eslint test.

** 2.1.5

* "Import" button now appears only for the modules that had the `import: true` flag set. The button displayed for other modules was always nonfunctional, so this is not a change in functionality. Thanks to Sebastian Geschke for this fix.

* `csv-parse` has been updated to the latest version to address an npm audit vulnerability report.

** 2.1.4

* Modern manage modal controls with no need to override a template, fully compatible with also having workflow and export modules in place. Also tests for rich text import of areas although they will only pass when the corresponding pr for apostrophe is pubished.

** 2.1.3

* Documented how to import joins. No code changes.

** 2.1.2

* Markdown typo that made the docs hard to read. No code changes.

** 2.1.1

* The update feature, which is activated by adding `:key` to the end of one and only one column name in the header row, can now match docs that are unpublished or in the trash, and update them. As a consequence it is also possible to publish (or unpublish) a doc via this module, by setting the `publish` property to `1` (published) or `0` (unpublished). Similarly, you may trash a doc via this module by setting the `trash` property to `1` (in the trash) or `0` (not in the trash).

* This module now has a unit test suite.

* This module now passes `eslint` checks, which caught the need to properly add `async` as a dependency.

** 2.1.0

* Support for updates as well as inserts. If you wish to make updates, you must have a "key column," labeled like this: `username:key`. Rows that have a value for the key column will update the existing piece with the corresponding value for that column. Note that you can update that same property, if you wish to, by presenting it in a separate column without the `:key` suffix.

** 2.0.1

* Documentation improvements.

** 2.0.0

* Introduced simplified alternate interface for custom file format parsers. If a stream interface is not available you can use a simple callback interface, at the price of keeping all of the data in RAM during the import, which for many file formats (notably Excel) is acceptable. A convenience wrapper automatically invokes these simplified parsers without the need to change the rest of the import logic.
* Added simple Excel import. The first worksheet in the file is imported. The standard string-based validators are applied to each field, much as if it were a CSV file.
* Fixed a crashing bug in the TSV reader due to a typo.
* Correctly refreshes the "manage" modal display when finished.
* Minor cleanup.
* Declared stable and bumped to 2.x to start out matching Apostrophe.
