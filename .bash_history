pkg update && pkg upgrade -y
pkg install git -y
termux-setup-storage
cd ~/storage/downloads/HSK-main
ls -la
git init
git add .
git commit -m "Initial HSK project"
git remote add origin https://github.com/luuanh2381-hub/Giaotrinh.git
git branch -M main
git push -u origin main
git status
git remote -v
git config --global --add safe.directory /storage/emulated/0/Download/HSK-main
git status
git add .
git commit -m "Initial HSK project"
git remote add origin https://github.com/luuanh2381-hub/Giaotrinh.git
git branch -M main
git push -u origin main
git config --global user.name "luuanh2381-hub"
git config --global user.email "luuanh2381@gmail.com"
git config --global user.name "luuanh2381-hub"
git add .
git commit -m "Initial HSK project"
git push -u origin main
termux-setup-storage
pkg update && pkg upgrade -y
git config --global user.name "luuanh2381-hub"
git config --global user.email "luuanh2381@gmail.com"
cd ~
git clone https://github.com/luuanh2381-hub/tiengtrung1.git
cd tiengtrung1
rsync -av --delete --exclude='.git' /storage/emulated/0/Download/app/ ~/tiengtrung1/
git add -A
git commit -m "Update app"
git branch -M main
git push -u origin main
pkg install rsync -y
rsync -av --delete --exclude='.git' /storage/emulated/0/Download/app/ ~/tiengtrung1/
git status --short
git add -A
git commit -m "Update to V131"
git push origin main
