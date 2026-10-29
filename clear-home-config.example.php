<?php
// Copy to clear-home-config.php OUTSIDE the public document root.
// The deployment helper places this template next to public/.
return [
    'admin_password' => 'CHANGE_THIS_PASSWORD', // At least 12 characters; 16+ recommended.
    'data_dir' => __DIR__ . '/clear-home-data',
    'secure_cookie' => false, // Set true on production sites that always use HTTPS.
];
