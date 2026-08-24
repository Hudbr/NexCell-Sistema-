<?php
session_start();
header('Content-Type: application/json');

$host = 'localhost'; 
$db   = 'mysql'; 
$user = 'root'; 
$pass = '';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'msg' => 'Erro conexao']);
    exit;
}

$action = $_GET['acao'] ?? '';

// LOGIN & SESSÃO
if ($action === 'login') {
    $d = json_decode(file_get_contents('php://input'), true);
    $stmt = $pdo->prepare("SELECT * FROM usuarios WHERE email = ?");
    $stmt->execute([trim($d['email'] ?? '')]);
    $u = $stmt->fetch();
    if ($u && password_verify(trim($d['senha'] ?? ''), $u['senha'])) {
        $_SESSION['usuario'] = ['id' => $u['id'], 'nome' => $u['nome'], 'cargo' => $u['cargo']];
        echo json_encode(['status' => 'success', 'usuario' => $_SESSION['usuario']]);
    } else {
        echo json_encode(['status' => 'error', 'msg' => 'Credenciais invalidas']);
    }
    exit;
}
if ($action === 'sessao') {
    echo json_encode(['logado' => isset($_SESSION['usuario']), 'usuario' => $_SESSION['usuario'] ?? null]);
    exit;
}
if ($action === 'logout') {
    session_destroy();
    echo json_encode(['status' => 'success']);
    exit;
}

if (!isset($_SESSION['usuario'])) {
    http_response_code(401);
    echo json_encode(['status' => 'error', 'msg' => 'Nao autorizado']);
    exit;
}

// PRODUTOS & ESTOQUE
if ($action === 'listar_produtos') {
    $prods = $pdo->query("SELECT * FROM produtos ORDER BY id DESC")->fetchAll();
    echo json_encode(['produtos' => $prods]);
    exit;
}
if ($action === 'salvar_produto') {
    if ($_SESSION['usuario']['cargo'] !== 'admin') { echo json_encode(['status' => 'error', 'msg' => 'Apenas admin']); exit; }
    $d = json_decode(file_get_contents('php://input'), true);
    if (!empty($d['id'])) {
        $stmt = $pdo->prepare("UPDATE produtos SET codigo=?, nome=?, categoria=?, marca=?, modelo=?, preco=?, estoque=? WHERE id=?");
        $stmt->execute([$d['codigo'], $d['nome'], $d['categoria'], $d['marca'], $d['modelo'], $d['preco'], $d['estoque'], $d['id']]);
    } else {
        $stmt = $pdo->prepare("INSERT INTO produtos (codigo, nome, categoria, marca, modelo, preco, estoque) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$d['codigo'], $d['nome'], $d['categoria'], $d['marca'], $d['modelo'], $d['preco'], $d['estoque']]);
    }
    echo json_encode(['status' => 'success']);
    exit;
}
if ($action === 'repor_estoque') {
    $d = json_decode(file_get_contents('php://input'), true);
    $stmt = $pdo->prepare("UPDATE produtos SET estoque = estoque + ? WHERE id = ?");
    $stmt->execute([intval($d['qtd']), intval($d['id'])]);
    echo json_encode(['status' => 'success']);
    exit;
}
if ($action === 'excluir_produto') {
    if ($_SESSION['usuario']['cargo'] !== 'admin') { echo json_encode(['status' => 'error', 'msg' => 'Apenas admin']); exit; }
    $stmt = $pdo->prepare("DELETE FROM produtos WHERE id = ?");
    $stmt->execute([intval($_GET['id'])]);
    echo json_encode(['status' => 'success']);
    exit;
}

// VENDAS
if ($action === 'registrar_venda') {
    $data = json_decode(file_get_contents('php://input'), true);
    $itens = $data['itens'] ?? [];
    if (empty($itens)) { echo json_encode(['status' => 'error', 'msg' => 'Vazio']); exit; }
    $pdo->beginTransaction();
    $stmtV = $pdo->prepare("INSERT INTO vendas (usuario_id, valor_total, forma_pagamento) VALUES (?, ?, ?)");
    $stmtV->execute([$_SESSION['usuario']['id'], $data['valor_total'], $data['metodo']]);
    $vid = $pdo->lastInsertId();
    $stmtI = $pdo->prepare("INSERT INTO itens_venda (venda_id, produto_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)");
    $stmtE = $pdo->prepare("UPDATE produtos SET estoque = estoque - ? WHERE id = ?");
    foreach ($itens as $i) {
        $stmtI->execute([$vid, $i['id'], $i['qtd'], $i['preco']]);
        $stmtE->execute([$i['qtd'], $i['id']]);
    }
    $pdo->commit();
    echo json_encode(['status' => 'success']);
    exit;
}

// USUÁRIOS
if ($action === 'listar_usuarios') {
    if ($_SESSION['usuario']['cargo'] !== 'admin') { echo json_encode(['status' => 'error', 'msg' => 'Apenas admin']); exit; }
    $users = $pdo->query("SELECT id, nome, email, cargo, criado_em FROM usuarios ORDER BY id DESC")->fetchAll();
    echo json_encode(['usuarios' => $users]);
    exit;
}
if ($action === 'salvar_usuario') {
    if ($_SESSION['usuario']['cargo'] !== 'admin') { echo json_encode(['status' => 'error', 'msg' => 'Apenas admin']); exit; }
    $d = json_decode(file_get_contents('php://input'), true);
    if (!empty($d['id'])) {
        if (!empty($d['senha'])) {
            $stmt = $pdo->prepare("UPDATE usuarios SET nome=?, email=?, cargo=?, senha=? WHERE id=?");
            $stmt->execute([$d['nome'], $d['email'], $d['cargo'], password_hash($d['senha'], PASSWORD_DEFAULT), $d['id']]);
        } else {
            $stmt = $pdo->prepare("UPDATE usuarios SET nome=?, email=?, cargo=? WHERE id=?");
            $stmt->execute([$d['nome'], $d['email'], $d['cargo'], $d['id']]);
        }
    } else {
        $stmt = $pdo->prepare("INSERT INTO usuarios (nome, email, cargo, senha) VALUES (?, ?, ?, ?)");
        $stmt->execute([$d['nome'], $d['email'], $d['cargo'], password_hash($d['senha'], PASSWORD_DEFAULT)]);
    }
    echo json_encode(['status' => 'success']);
    exit;
}
if ($action === 'excluir_usuario') {
    if ($_SESSION['usuario']['cargo'] !== 'admin') { echo json_encode(['status' => 'error', 'msg' => 'Apenas admin']); exit; }
    $id = intval($_GET['id']);
    if ($id === $_SESSION['usuario']['id']) { echo json_encode(['status' => 'error', 'msg' => 'Você não pode excluir sua própria conta']); exit; }
    $stmt = $pdo->prepare("DELETE FROM usuarios WHERE id = ?");
    $stmt->execute([$id]);
    echo json_encode(['status' => 'success']);
    exit;
}

// CONFIGURAÇÕES DA EMPRESA
if ($action === 'obter_config') {
    $cfg = $pdo->query("SELECT * FROM config_empresa WHERE id = 1")->fetch();
    echo json_encode(['config' => $cfg]);
    exit;
}
if ($action === 'salvar_config') {
    if ($_SESSION['usuario']['cargo'] !== 'admin') { echo json_encode(['status' => 'error', 'msg' => 'Apenas admin']); exit; }
    $d = json_decode(file_get_contents('php://input'), true);
    $stmt = $pdo->prepare("UPDATE config_empresa SET nome_loja=?, telefone_whatsapp=?, chave_pix=?, msg_garantia=? WHERE id=1");
    $stmt->execute([$d['nome_loja'], $d['telefone_whatsapp'], $d['chave_pix'], $d['msg_garantia']]);
    echo json_encode(['status' => 'success']);
    exit;
}

// FECHAMENTO DE CAIXA
if ($action === 'fechamento_caixa') {
    $stmt = $pdo->query("SELECT forma_pagamento, COUNT(id) as total_vendas, SUM(valor_total) as montante FROM vendas WHERE DATE(data_venda)=CURDATE() GROUP BY forma_pagamento");
    echo json_encode(['status' => 'success', 'balanco' => $stmt->fetchAll()]);
    exit;
}
if ($action === 'limpar_vendas_teste') {
    if ($_SESSION['usuario']['cargo'] !== 'admin') { echo json_encode(['status' => 'error', 'msg' => 'Acesso negado']); exit; }
    $pdo->exec("DELETE FROM itens_venda");
    $pdo->exec("DELETE FROM vendas");
    echo json_encode(['status' => 'success']);
    exit;
}