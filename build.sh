#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting CDK Utility Constructs build...${NC}"

# Clean previous builds
echo -e "${YELLOW}Cleaning previous builds...${NC}"
rm -rf dist/
rm -rf .jsii
rm -rf *.tgz

# Check if we have an index.ts file, if not create one
if [ ! -f "lib/index.ts" ]; then
    echo -e "${YELLOW}Creating lib/index.ts file...${NC}"
    cat > lib/index.ts << 'EOF'
// Export all constructs
export * from './cloudfront-for-lambda/cloudfront-for-lambda';
export * from './s3-backup/s3-backup';
EOF
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm clean-install
fi

# Compile TypeScript
echo -e "${YELLOW}Compiling TypeScript...${NC}"
npx tsgo

# Run jsii compilation for multi-language support (Construct Hub requirement)
echo -e "${YELLOW}Running jsii compilation...${NC}"
npx jsii

# Package the module for multiple languages
echo -e "${YELLOW}Packaging the module for multiple languages...${NC}"
npx jsii-pacmak

# Prepare npm package files
echo -e "${YELLOW}Preparing npm package files...${NC}"
cp package.json dist/
cp README.md dist/ 2>/dev/null || echo "No README.md found, skipping..."
cp LICENSE* dist/ 2>/dev/null || echo "No LICENSE file found, skipping..."

# Create npm package tarball from dist directory
echo -e "${YELLOW}Creating npm package tarball...${NC}"
cd dist
npm pack
mv *.tgz ../
cd ..

# Verify package contents
echo -e "${YELLOW}Verifying package contents...${NC}"
tar -tzf *.tgz | head -20

echo -e "${GREEN}Build completed successfully!${NC}"
echo -e "${GREEN}Generated files:${NC}"
echo -e "  - ${GREEN}dist/${NC} - TypeScript compiled output and multi-language packages"
echo -e "  - ${GREEN}.jsii${NC} - jsii assembly file"
echo -e "  - ${GREEN}*.tgz${NC} - NPM package tarball"

# Display package info
if [ -f "package.json" ]; then
    PACKAGE_NAME=$(node -p "require('./package.json').name")
    PACKAGE_VERSION=$(node -p "require('./package.json').version")
    echo -e "${GREEN}Package:${NC} ${PACKAGE_NAME}@${PACKAGE_VERSION}"
    echo -e "${GREEN}Tarball:${NC} $(ls *.tgz)"
    echo -e "${GREEN}Size:${NC} $(du -h *.tgz | cut -f1)"
fi

echo -e "${GREEN}To test the package locally, run:${NC}"
echo -e "  npm install ./$(ls *.tgz)"