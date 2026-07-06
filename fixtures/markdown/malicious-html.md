# Malicious HTML Fixture

The reader must sanitize embedded HTML from untrusted Markdown.

<script>window.__md_reader_script_executed = true;</script>

<img src="x" onerror="window.__md_reader_img_onerror_executed = true">

<a href="javascript:window.__md_reader_link_executed = true">dangerous link</a>

Safe inline HTML can be preserved only if the sanitizer explicitly allows it.
