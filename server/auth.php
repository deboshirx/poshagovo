<?php

function current_user()
{
    static $user = false;
    if ($user !== false) return $user;

    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    $token = strpos($header, 'Bearer ') === 0 ? substr($header, 7) : null;
    $user = null;
    if ($token) {
        $row = one('SELECT u.id, u.name, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?', [$token]);
        if ($row) {
            $row['id'] = (int) $row['id'];
            $user = $row;
        }
    }
    return $user;
}

function current_token()
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    return strpos($header, 'Bearer ') === 0 ? substr($header, 7) : null;
}

function anon_id()
{
    $id = str($_SERVER['HTTP_X_ANON_ID'] ?? '', 64);
    return $id !== '' ? $id : null;
}

function user_id()
{
    $u = current_user();
    return $u ? $u['id'] : null;
}

function require_auth()
{
    $u = current_user();
    if (!$u) throw new HttpError(401, 'Сначала войдите в аккаунт');
    return $u;
}

function require_expert()
{
    $u = require_auth();
    if ($u['role'] !== 'expert') throw new HttpError(403, 'Доступно только экспертам');
    return $u;
}

function create_session($userId)
{
    $token = bin2hex(random_bytes(24));
    q('INSERT INTO sessions (token, user_id) VALUES (?, ?)', [$token, $userId]);
    return $token;
}

function claim_guest_runs($userId, $anonId)
{
    if (!$anonId) return;
    q('UPDATE runs SET user_id = ? WHERE anon_id = ? AND user_id IS NULL', [$userId, $anonId]);
}

function route_register()
{
    $name = str(input('name'), 60);
    $email = mb_strtolower(str(input('email'), 120));
    $password = is_string(input('password')) ? input('password') : '';

    if (mb_strlen($name) < 2) throw new HttpError(400, 'Имя слишком короткое');
    if (!preg_match('/^\S+@\S+\.\S+$/', $email)) throw new HttpError(400, 'Проверьте email');
    if (mb_strlen($password) < 6) throw new HttpError(400, 'Пароль должен быть не короче 6 символов');

    $role = 'student';
    if (input('role') === 'expert') {
        $code = getenv('EXPERT_CODE') ?: 'expert2026';
        if (input('expertCode') !== $code) throw new HttpError(400, 'Неверный код эксперта');
        $role = 'expert';
    }

    if (one('SELECT 1 FROM users WHERE email = ?', [$email])) {
        throw new HttpError(409, 'Пользователь с таким email уже есть');
    }

    q('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [
        $name, $email, password_hash($password, PASSWORD_DEFAULT), $role,
    ]);
    $id = last_id();
    claim_guest_runs($id, anon_id());

    json_out(['token' => create_session($id), 'user' => compact('id', 'name', 'email', 'role')], 201);
}

function route_login()
{
    $email = mb_strtolower(str(input('email'), 120));
    $password = is_string(input('password')) ? input('password') : '';
    $user = one('SELECT * FROM users WHERE email = ?', [$email]);

    if (!$user || !password_verify($password, $user['password_hash'])) {
        throw new HttpError(401, 'Неверный email или пароль');
    }

    $id = (int) $user['id'];
    claim_guest_runs($id, anon_id());
    json_out([
        'token' => create_session($id),
        'user' => ['id' => $id, 'name' => $user['name'], 'email' => $user['email'], 'role' => $user['role']],
    ]);
}

function route_me()
{
    json_out(['user' => current_user()]);
}

function route_logout()
{
    require_auth();
    q('DELETE FROM sessions WHERE token = ?', [current_token()]);
    no_content();
}
